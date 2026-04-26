const crypto = require('crypto');

const Razorpay = require('razorpay');
const pool = require('../config/db');

let razorpayClient;

function getRazorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay is not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  return razorpayClient;
}

function createReceiptId(userId) {
  const compactUserId = String(userId).replace(/-/g, '').slice(0, 12);
  const timestamp = Date.now().toString(36);
  return `rcpt_${compactUserId}_${timestamp}`;
}

// Premium features and their prices (in paisa, so 99900 = ₹999)
const PREMIUM_FEATURES = {
  advanced_analytics: {
    name: 'Advanced Analytics Report',
    amount: 49900, // ₹499
    description: 'Detailed financial analysis with custom date ranges',
  },
  data_export: {
    name: 'Data Export (CSV/PDF)',
    amount: 29900, // ₹299
    description: 'Export your transaction data in multiple formats',
  },
  custom_reports: {
    name: 'Custom Reports Bundle',
    amount: 99900, // ₹999
    description: 'Unlimited custom report generation for 1 year',
  },
  ai_insights: {
    name: 'AI Insights (3 months)',
    amount: 79900, // ₹799
    description: 'Advanced AI-powered spending insights and recommendations',
  },
};

/**
 * Create a Razorpay order
 * @param {string} userId - User ID
 * @param {string} featureId - Feature ID (key from PREMIUM_FEATURES)
 * @returns {Promise<Object>} Order details
 */
async function createOrder(userId, featureId) {
  try {
    // Validate feature
    if (!PREMIUM_FEATURES[featureId]) {
      throw new Error('Invalid feature ID');
    }

    const feature = PREMIUM_FEATURES[featureId];

    // Create Razorpay order
    const order = await getRazorpayClient().orders.create({
      amount: feature.amount,
      currency: 'INR',
      receipt: createReceiptId(userId),
      description: feature.description,
      notes: {
        userId,
        featureId,
        timestamp: new Date().toISOString(),
      },
    });

    // Store order in database
    const result = await pool.query(
      'INSERT INTO payments (user_id, razorpay_order_id, amount, currency, description, feature, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [userId, order.id, feature.amount / 100, 'INR', feature.description, featureId, 'pending'],
    );

    console.log(`✅ Order created: ${order.id} for user ${userId}`);

    return {
      orderId: order.id,
      amount: feature.amount,
      currency: 'INR',
      feature: featureId,
      featureName: feature.name,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
    };
  } catch (error) {
    console.error('❌ Failed to create order:', error);
    throw error;
  }
}

/**
 * Verify Razorpay payment signature
 * @param {string} orderId - Razorpay Order ID
 * @param {string} paymentId - Razorpay Payment ID
 * @param {string} signature - Razorpay Signature
 * @returns {boolean} Signature validity
 */
function verifyPaymentSignature(orderId, paymentId, signature) {
  try {
    if (!process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay key secret is not configured');
    }

    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');

    const isValid = signature === expectedSignature;
    console.log(`✅ Payment signature ${isValid ? 'verified' : 'failed'}`);
    return isValid;
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

/**
 * Verify and complete payment
 * @param {string} orderId - Razorpay Order ID
 * @param {string} paymentId - Razorpay Payment ID
 * @param {string} signature - Razorpay Signature
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Payment details
 */
async function verifyPayment(orderId, paymentId, signature, userId) {
  try {
    // Verify signature
    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
      throw new Error('Invalid payment signature');
    }

    // Fetch payment details from Razorpay
    const payment = await getRazorpayClient().payments.fetch(paymentId);

    if (payment.order_id !== orderId) {
      throw new Error('Payment does not match order');
    }

    if (!['authorized', 'captured'].includes(payment.status)) {
      throw new Error(`Payment is ${payment.status}`);
    }

    // Update payment in database
    const result = await pool.query(
      'UPDATE payments SET razorpay_payment_id = $1, razorpay_signature = $2, status = $3, payment_method = $4, paid_at = $5, updated_at = NOW() WHERE razorpay_order_id = $6 AND user_id = $7 RETURNING *',
      [paymentId, signature, 'completed', payment.method, new Date(), orderId, userId],
    );

    if (result.rows.length === 0) {
      throw new Error('Payment record not found');
    }

    console.log(`✅ Payment verified: ${paymentId} for user ${userId}`);

    return result.rows[0];
  } catch (error) {
    console.error('❌ Payment verification failed:', error);

    // Update payment status as failed
    try {
      await pool.query(
        'UPDATE payments SET status = $1, error_message = $2, updated_at = NOW() WHERE razorpay_order_id = $3 RETURNING *',
        ['failed', error.message, orderId],
      );
    } catch (updateError) {
      console.error('Failed to update payment status:', updateError);
    }

    throw error;
  }
}

/**
 * Get payment history for a user
 * @param {string} userId - User ID
 * @param {number} limit - Number of records to fetch
 * @param {number} offset - Offset for pagination
 * @returns {Promise<Array>} Payment records
 */
async function getPaymentHistory(userId, limit = 10, offset = 0) {
  try {
    const result = await pool.query(
      'SELECT id, razorpay_order_id, razorpay_payment_id, amount, currency, description, feature, status, payment_method, created_at, paid_at FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [userId, limit, offset],
    );

    return result.rows;
  } catch (error) {
    console.error('❌ Failed to fetch payment history:', error);
    throw error;
  }
}

/**
 * Get feature pricing
 * @returns {Object} All premium features with prices
 */
function getFeaturePricing() {
  const pricing = {};
  for (const [key, feature] of Object.entries(PREMIUM_FEATURES)) {
    pricing[key] = {
      name: feature.name,
      amount: feature.amount / 100, // Convert paisa to rupees
      description: feature.description,
    };
  }
  return pricing;
}

/**
 * Check if user has purchased a feature
 * @param {string} userId - User ID
 * @param {string} featureId - Feature ID
 * @returns {Promise<boolean>} Whether user has purchased
 */
async function hasUserPurchased(userId, featureId) {
  try {
    const result = await pool.query(
      'SELECT id FROM payments WHERE user_id = $1 AND feature = $2 AND status = $3 LIMIT 1',
      [userId, featureId, 'completed'],
    );

    return result.rows.length > 0;
  } catch (error) {
    console.error('❌ Failed to check purchase status:', error);
    return false;
  }
}

module.exports = {
  createOrder,
  verifyPayment,
  verifyPaymentSignature,
  getPaymentHistory,
  getFeaturePricing,
  hasUserPurchased,
  PREMIUM_FEATURES,
};
