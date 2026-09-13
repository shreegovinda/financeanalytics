const test = require('node:test');
const assert = require('node:assert/strict');
const {
  redactString,
  redactObject,
  redactDiagnosticPayload,
  MAX_PAYLOAD_BYTES,
} = require('../utils/redact');

test('redactString sanitizes auth tokens, cookies, emails, API keys, and account numbers', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyJ9.456xyz';
  const bearer = 'Bearer ' + jwt;
  const email = 'user.test@example.com';
  const cookie = 'cookie: session=secret123; path=/';
  const anthropicKey = 'sk-ant-api03-abcdefghijklmnop1234567890';
  const googleKey = 'AIzaSyD-1234567890123456789012345678901';
  const bankAccount = '123456789012'; // 12 digits

  const input = `Error for ${email} with account ${bankAccount} using ${bearer} and ${cookie}. Keys: ${anthropicKey}, ${googleKey}`;
  const redacted = redactString(input);

  assert.equal(redacted.includes('user.test@example.com'), false);
  assert.equal(redacted.includes(bankAccount), false);
  assert.equal(redacted.includes(anthropicKey), false);
  assert.equal(redacted.includes(googleKey), false);
  assert.equal(redacted.includes('secret123'), false);

  assert.ok(redacted.includes('[REDACTED_EMAIL]'));
  assert.ok(redacted.includes('[REDACTED_ACCOUNT]'));
  assert.ok(redacted.includes('[REDACTED_API_KEY]'));
  assert.ok(redacted.includes('cookie: [REDACTED_COOKIE]'));
});

test('redactObject redacts sensitive keys and nested objects recursively', () => {
  const payload = {
    user: {
      email: 'sensitive@test.com',
      password: 'supersecretpassword',
      token: 'jwt-token-string',
      accountNumber: '987654321012',
    },
    meta: {
      tags: ['app-crash', 'sk-ant-testkey1234567890'],
    },
  };

  const sanitized = redactObject(payload);

  assert.equal(sanitized.user.password, '[REDACTED]');
  assert.equal(sanitized.user.token, '[REDACTED]');
  assert.equal(sanitized.user.email, '[REDACTED_EMAIL]');
  assert.equal(sanitized.user.accountNumber, '[REDACTED_ACCOUNT]');
  assert.equal(sanitized.meta.tags[1], '[REDACTED_API_KEY]');
});

test('redactDiagnosticPayload enforces 5KB size bound with graceful truncation note', () => {
  // Generate a huge payload over 5KB
  const bigDetails = {
    error_summary: 'Render loop exception in component',
    huge_stack: 'x'.repeat(10000),
  };

  const bounded = redactDiagnosticPayload(bigDetails);
  const jsonSize = Buffer.byteLength(JSON.stringify(bounded), 'utf8');

  assert.ok(jsonSize <= MAX_PAYLOAD_BYTES);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.error_summary, 'Render loop exception in component');
  assert.ok(bounded.note.includes('5KB'));
});

test('POST /api/support/crash-report stores redacted report and validates fields', async () => {
  let insertedValues = null;
  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO crash_reports')) {
        insertedValues = params;
        return {
          rows: [
            {
              id: 'rep-456-uuid',
              status: 'open',
              created_at: new Date().toISOString(),
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  function mockModule(modulePath, exports) {
    const resolvedPath = require.resolve(modulePath);
    const originalModule = require.cache[resolvedPath];
    require.cache[resolvedPath] = {
      id: resolvedPath,
      filename: resolvedPath,
      loaded: true,
      exports,
    };
    return () => {
      if (originalModule) {
        require.cache[resolvedPath] = originalModule;
      } else {
        delete require.cache[resolvedPath];
      }
    };
  }

  const supportRouterPath = require.resolve('../routes/support');
  delete require.cache[supportRouterPath];
  const restoreDb = mockModule('../config/db', mockDb);

  const router = require('../routes/support');
  const route = router.stack.find(
    (l) => l.route && l.route.path === '/crash-report' && l.route.methods.post,
  );
  assert.ok(route);

  const handler = route.route.stack[route.route.stack.length - 1].handle;

  function createMockRes() {
    return {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
    };
  }

  // 1. Success case with sensitive email and account in summary/details
  const req = {
    body: {
      app_version: '1.2.0',
      page_url: 'https://app.finlytix.in/dashboard',
      browser: 'Chrome 120',
      device_class: 'mobile',
      error_summary: 'Failed for user admin@test.com with acc 987654321012',
      error_details: {
        error:
          'Authorization failed with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMyJ9.456xyz',
      },
    },
    headers: {},
  };
  const res = createMockRes();
  await handler(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.reportId, 'rep-456-uuid');

  // Verify DB insert received redacted strings
  assert.ok(insertedValues);
  const [userId, appVersion, pageUrl, browser, deviceClass, summary, detailsJson] = insertedValues;
  assert.equal(userId, null);
  assert.equal(appVersion, '1.2.0');
  assert.equal(deviceClass, 'mobile');
  assert.equal(summary.includes('admin@test.com'), false);
  assert.ok(summary.includes('[REDACTED_EMAIL]'));
  assert.equal(summary.includes('987654321012'), false);
  assert.ok(summary.includes('[REDACTED_ACCOUNT]'));

  const parsedDetails = JSON.parse(detailsJson);
  assert.equal(parsedDetails.error.includes('eyJhbGci'), false);
  assert.ok(parsedDetails.error.includes('Bearer [REDACTED_TOKEN]'));

  // 2. Reject missing error_summary
  const badReq = { body: { error_details: {} }, headers: {} };
  const badRes = createMockRes();
  await handler(badReq, badRes);
  assert.equal(badRes.statusCode, 400);

  restoreDb();
  delete require.cache[supportRouterPath];
});
