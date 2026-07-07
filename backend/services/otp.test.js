const assert = require('node:assert/strict');
const test = require('node:test');

function loadOtpWithPool(pool) {
  const poolPath = require.resolve('../config/db');
  const otpPath = require.resolve('./otp');
  const originalPoolModule = require.cache[poolPath];

  delete require.cache[otpPath];
  require.cache[poolPath] = {
    id: poolPath,
    filename: poolPath,
    loaded: true,
    exports: pool,
  };

  return {
    otp: require(otpPath),
    cleanup() {
      delete require.cache[otpPath];
      if (originalPoolModule) {
        require.cache[poolPath] = originalPoolModule;
      } else {
        delete require.cache[poolPath];
      }
    },
  };
}

test('storeOTP persists the requested purpose', async () => {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [], rowCount: 1 };
    },
  };
  const { otp, cleanup } = loadOtpWithPool(pool);

  try {
    await otp.storeOTP('user@example.com', '123456', otp.OTP_PURPOSES.PASSWORD_RESET);

    assert.match(queries[0].sql, /purpose/);
    assert.equal(queries[0].params[2], otp.OTP_PURPOSES.PASSWORD_RESET);
  } finally {
    cleanup();
  }
});

test('verifyOTP only accepts codes for the requested purpose', async () => {
  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.includes('FROM otp_codes')) {
        return { rows: [{ id: 'otp-id' }] };
      }

      return { rows: [], rowCount: 1 };
    },
  };
  const { otp, cleanup } = loadOtpWithPool(pool);

  try {
    const result = await otp.verifyOTP('user@example.com', '123456', otp.OTP_PURPOSES.LOGIN);

    assert.equal(result.success, true);
    assert.match(queries[0].sql, /purpose = \$3/);
    assert.equal(queries[0].params[2], otp.OTP_PURPOSES.LOGIN);
    assert.deepEqual(queries[1].params, ['otp-id']);
  } finally {
    cleanup();
  }
});
