const test = require('node:test');
const assert = require('node:assert/strict');
const nodemailer = require('nodemailer');
const email = require('../services/email');

function setup(t, overrides = {}) {
  const config = {
    EMAIL_PROVIDER: 'smtp',
    EMAIL_FROM: 'admin@example.com',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: '465',
    SMTP_SECURE: 'true',
    SMTP_USER: 'admin@example.com',
    SMTP_PASSWORD: 'test-secret',
    ...overrides,
  };
  const saved = Object.fromEntries(Object.keys(config).map((k) => [k, process.env[k]]));
  Object.assign(process.env, config);
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test('SMTP uses encrypted GoDaddy-style transport and sends both body formats', async (t) => {
  setup(t);
  let closed = false;
  t.mock.method(nodemailer, 'createTransport', (options) => {
    assert.equal(options.port, 465);
    assert.equal(options.secure, true);
    assert.deepEqual(options.auth, { user: 'admin@example.com', pass: 'test-secret' });
    assert.equal(options.tls, undefined, 'certificate validation is not disabled');
    return {
      async sendMail(message) {
        assert.equal(message.from, 'admin@example.com');
        assert.equal(message.to, 'recipient@example.com');
        assert.equal(message.text, 'Test message');
        assert.equal(message.html, '<p>Test message</p>');
        return { accepted: [message.to], rejected: [] };
      },
      close() {
        closed = true;
      },
    };
  });
  const result = await email.sendMail({
    to: 'recipient@example.com',
    subject: 'Test',
    html: '<p>Test message</p>',
  });
  assert.equal(result.provider, 'smtp');
  assert.equal(closed, true);
});

test('SMTP rejects incomplete or malformed configuration before delivery', (t) => {
  setup(t, { SMTP_PASSWORD: '' });
  assert.equal(email.isEmailConfigured(), false);
  assert.throws(() => email.assertEmailConfigured(), /SMTP_PASSWORD/);
  process.env.SMTP_PASSWORD = 'test-secret';
  process.env.SMTP_PORT = 'invalid';
  assert.throws(() => email.assertEmailConfigured(), /SMTP_PORT/);
  process.env.SMTP_PORT = '465';
  process.env.SMTP_SECURE = 'invalid';
  assert.throws(() => email.assertEmailConfigured(), /SMTP_SECURE/);
});

test('SMTP requires STARTTLS on the submission port and hides authentication errors', async (t) => {
  setup(t, { SMTP_PORT: '587', SMTP_SECURE: 'false' });
  let closed = false;
  t.mock.method(nodemailer, 'createTransport', (options) => {
    assert.equal(options.secure, false);
    assert.equal(options.requireTLS, true);
    return {
      async sendMail() {
        throw new Error('Authentication failed test-secret');
      },
      close() {
        closed = true;
      },
    };
  });
  await assert.rejects(
    email.sendMail({ to: 'recipient@example.com', subject: 'Test', html: 'Test' }),
    (error) => {
      assert.match(error.message, /SMTP email delivery failed/);
      assert.doesNotMatch(error.message, /test-secret/);
      return true;
    },
  );
  assert.equal(closed, true);
});

test('SMTP does not report a rejected recipient as successful delivery', async (t) => {
  setup(t);
  t.mock.method(nodemailer, 'createTransport', () => ({
    async sendMail() {
      return { accepted: [], rejected: ['recipient@example.com'] };
    },
    close() {},
  }));
  await assert.rejects(
    email.sendMail({ to: 'recipient@example.com', subject: 'Test', html: 'Test' }),
    /SMTP email delivery failed/,
  );
});
