const assert = require('node:assert/strict');
const test = require('node:test');

function loadOtpServiceWithMockedDb(query) {
  const dbPath = require.resolve('../config/db');
  const otpPath = require.resolve('./otp');

  delete require.cache[otpPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { query },
  };

  return require('./otp');
}

test('storeOTP persists the OTP purpose', async () => {
  const queries = [];
  const { storeOTP } = loadOtpServiceWithMockedDb(async (sql, params) => {
    queries.push({ sql, params });
    return { rows: [], rowCount: 1 };
  });

  await storeOTP('user@example.com', '123456', 'password_reset');

  assert.match(queries[0].sql, /purpose/);
  assert.equal(queries[0].params[2], 'password_reset');
});

test('verifyOTP only accepts a code for the requested purpose', async () => {
  const queries = [];
  const { verifyOTP } = loadOtpServiceWithMockedDb(async (sql, params) => {
    queries.push({ sql, params });

    if (sql.includes('SELECT')) {
      return {
        rows: params[2] === 'password_reset' ? [{ id: 'otp-id' }] : [],
      };
    }

    return { rows: [], rowCount: 1 };
  });

  const loginResult = await verifyOTP('user@example.com', '123456', 'login');
  const resetResult = await verifyOTP('user@example.com', '123456', 'password_reset');

  assert.equal(loginResult.success, false);
  assert.equal(resetResult.success, true);
  assert.equal(queries[0].params[2], 'login');
  assert.equal(queries[1].params[2], 'password_reset');
  assert.deepEqual(queries[2].params, ['otp-id']);
});
