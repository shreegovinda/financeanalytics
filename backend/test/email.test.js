const test = require('node:test');
const assert = require('node:assert/strict');

const ENV_KEYS = ['EMAIL_PROVIDER', 'SENDGRID_API_KEY', 'SENDGRID_FROM_EMAIL', 'NODE_ENV'];

/**
 * The email module reads process.env at call time, so each test can reshape the
 * environment as long as it restores it afterwards.
 */
function withEnv(overrides, fn) {
  const saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
  }
  try {
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
    Object.assign(process.env, overrides);
    return fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = saved[key];
      }
    }
  }
}

const email = require('../services/email');
const { escapeHtml, verificationEmail, otpEmail } = require('../services/emailTemplates');

test('provider defaults to console when no SendGrid key is present', () => {
  withEnv({}, () => {
    assert.equal(email.getProvider().id, 'console');
    assert.equal(email.isEmailConfigured(), true, 'console needs no configuration');
  });
});

test('provider defaults to sendgrid when a key is present', () => {
  withEnv({ SENDGRID_API_KEY: 'SG.test' }, () => {
    assert.equal(email.getProvider().id, 'sendgrid');
  });
});

test('EMAIL_PROVIDER overrides the key-based default', () => {
  withEnv({ EMAIL_PROVIDER: 'console', SENDGRID_API_KEY: 'SG.test' }, () => {
    assert.equal(email.getProvider().id, 'console');
  });
});

test('an unknown provider is rejected by name', () => {
  withEnv({ EMAIL_PROVIDER: 'carrier-pigeon' }, () => {
    assert.throws(() => email.getProvider(), /Unknown EMAIL_PROVIDER "carrier-pigeon"/);
    assert.equal(email.isEmailConfigured(), false);
  });
});

test('sendgrid selected without a key is reported unconfigured', () => {
  withEnv({ EMAIL_PROVIDER: 'sendgrid' }, () => {
    assert.equal(email.isEmailConfigured(), false);
    assert.throws(() => email.assertEmailConfigured(), /not configured/);
  });
});

test('production refuses the console provider', () => {
  // Otherwise verification codes are written to a log nobody reads and users
  // silently lock themselves out.
  withEnv({ NODE_ENV: 'production', EMAIL_PROVIDER: 'console' }, () => {
    assert.throws(() => email.assertEmailConfigured(), /NODE_ENV is production/);
  });
});

test('production accepts sendgrid with a key', () => {
  withEnv({ NODE_ENV: 'production', EMAIL_PROVIDER: 'sendgrid', SENDGRID_API_KEY: 'SG.x' }, () => {
    assert.equal(email.assertEmailConfigured().id, 'sendgrid');
  });
});

test('sendMail requires a complete message', async () => {
  await assert.rejects(() => email.sendMail({ to: 'a@b.com' }), /requires to, subject, and html/);
  await assert.rejects(
    () => email.sendMail({ to: 'a@b.com', subject: 'hi' }),
    /requires to, subject, and html/,
  );
});

test('htmlToText produces a readable plain-text alternative', () => {
  const text = email.htmlToText('<div><h1>Title</h1><p>Hello&nbsp;there</p><br>Code: 123456</div>');
  assert.match(text, /Title/);
  assert.match(text, /Hello there/);
  assert.match(text, /Code: 123456/);
  assert.doesNotMatch(text, /</, 'tags are stripped');
});

test('escapeHtml neutralises markup in interpolated values', () => {
  assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
  assert.equal(escapeHtml('"quoted"'), '&quot;quoted&quot;');
  assert.equal(escapeHtml(null), '');
});

test('a hostile display name cannot inject markup into an email', () => {
  // Names are user-supplied at registration and end up in mail carrying this
  // app's branding.
  const { html } = otpEmail({ name: '<img src=x onerror=alert(1)>', otp: '123456' });
  assert.doesNotMatch(html, /<img src=x/, 'raw tag must not survive');
  assert.match(html, /&lt;img src=x/, 'it is escaped instead');
});

test('the verification email carries both a link and a code', () => {
  const { subject, html } = verificationEmail({
    name: 'Sam',
    otp: '424242',
    verifyUrl: 'http://localhost:3000/verify-email?token=abc123',
    expiryMinutes: 30,
  });

  assert.match(subject, /Verify your/i);
  assert.match(html, /verify-email\?token=abc123/, 'link is present');
  assert.match(html, /424242/, 'code is present as a fallback');
  assert.match(html, /30 minutes/);
});
