const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

function loadPaymentWithPool(pool) {
  const dbPath = path.resolve(__dirname, '../config/db.js');
  const paymentPath = path.resolve(__dirname, '../services/payment.js');

  delete require.cache[paymentPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: pool,
  };

  return require(paymentPath);
}

test('verifyPayment failure only marks the authenticated user pending order failed', async () => {
  const previousSecret = process.env.RAZORPAY_KEY_SECRET;
  process.env.RAZORPAY_KEY_SECRET = 'test_secret';

  const queries = [];
  const pool = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql.startsWith('SELECT amount, feature, status')) {
        return {
          rows: [{ amount: 499, feature: 'advanced_analytics', status: 'pending' }],
        };
      }
      return { rows: [] };
    },
  };
  const { verifyPayment } = loadPaymentWithPool(pool);

  try {
    await assert.rejects(
      () => verifyPayment('order_123', 'pay_123', 'invalid_signature', 'user_123'),
      /Invalid payment signature/,
    );

    const failureUpdate = queries.find((query) =>
      query.sql.startsWith('UPDATE payments SET status = $1'),
    );
    assert.ok(failureUpdate);
    assert.match(failureUpdate.sql, /user_id = \$4/);
    assert.match(failureUpdate.sql, /status = \$5/);
    assert.deepEqual(failureUpdate.params, [
      'failed',
      'Invalid payment signature',
      'order_123',
      'user_123',
      'pending',
    ]);
  } finally {
    if (previousSecret === undefined) {
      delete process.env.RAZORPAY_KEY_SECRET;
    } else {
      process.env.RAZORPAY_KEY_SECRET = previousSecret;
    }
  }
});
