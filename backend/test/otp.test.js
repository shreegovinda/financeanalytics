const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

function loadOtpWithPool(pool) {
  const dbPath = path.resolve(__dirname, '../config/db.js');
  const otpPath = path.resolve(__dirname, '../services/otp.js');

  delete require.cache[otpPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: pool,
  };

  return require(otpPath);
}

test('verifyOTP atomically claims a purpose-scoped unused code', async () => {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [{ id: 'otp-id' }] };
    },
  };
  const { OTP_PURPOSES, verifyOTP } = loadOtpWithPool(pool);

  const result = await verifyOTP('user@example.com', '123456', OTP_PURPOSES.PASSWORD_RESET);

  assert.equal(result.success, true);
  assert.equal(queries.length, 1);
  assert.match(queries[0].sql, /UPDATE otp_codes/);
  assert.match(queries[0].sql, /purpose = \$3/);
  assert.deepEqual(queries[0].params, ['user@example.com', '123456', OTP_PURPOSES.PASSWORD_RESET]);
});
