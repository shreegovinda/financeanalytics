const assert = require('node:assert/strict');
const test = require('node:test');

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

function loadPaymentService(pool) {
  const paymentPath = require.resolve('../services/payment');
  const originalPayment = require.cache[paymentPath];
  delete require.cache[paymentPath];

  const restoreDb = mockModule('../config/db', pool);
  const service = require('../services/payment');

  return {
    service,
    cleanup() {
      delete require.cache[paymentPath];
      if (originalPayment) {
        require.cache[paymentPath] = originalPayment;
      }
      restoreDb();
    },
  };
}

test('verifyPayment only marks the authenticated pending order failed after verification errors', async () => {
  const originalSecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';

  const queries = [];
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [] };
    },
  };
  const { service, cleanup } = loadPaymentService(pool);

  try {
    await assert.rejects(
      () => service.verifyPayment('order_123', 'pay_123', 'invalid_signature', 'user_123'),
      /Invalid payment signature/,
    );

    assert.equal(queries.length, 1);
    assert.match(queries[0].sql, /razorpay_order_id = \$3/);
    assert.match(queries[0].sql, /user_id = \$4/);
    assert.match(queries[0].sql, /status = \$5/);
    assert.deepEqual(queries[0].params, [
      'failed',
      'Invalid payment signature',
      'order_123',
      'user_123',
      'pending',
    ]);
  } finally {
    cleanup();
    if (originalSecret === undefined) {
      delete process.env.RAZORPAY_KEY_SECRET;
    } else {
      process.env.RAZORPAY_KEY_SECRET = originalSecret;
    }
  }
});
