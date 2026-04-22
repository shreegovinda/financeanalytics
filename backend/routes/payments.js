const express = require('express');
const {
  createOrder,
  verifyPayment,
  getPaymentHistory,
  getFeaturePricing,
  hasUserPurchased,
} = require('../services/payment');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/payments/pricing
 * Get all premium features and their prices
 */
router.get('/pricing', (req, res) => {
  try {
    const pricing = getFeaturePricing();
    res.json(pricing);
  } catch (err) {
    console.error('Error fetching pricing:', err);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

/**
 * POST /api/payments/create-order
 * Create a Razorpay order for a premium feature
 * Body: { featureId: string }
 */
router.post('/create-order', authenticateToken, async (req, res) => {
  const { featureId } = req.body;
  const userId = req.user.id;

  if (!featureId) {
    return res.status(400).json({ error: 'Feature ID is required' });
  }

  try {
    const order = await createOrder(userId, featureId);
    res.json(order);
  } catch (err) {
    console.error('Error creating order:', err);
    res.status(500).json({ error: err.message || 'Failed to create order' });
  }
});

/**
 * POST /api/payments/verify
 * Verify Razorpay payment and complete transaction
 * Body: { orderId, paymentId, signature }
 */
router.post('/verify', authenticateToken, async (req, res) => {
  const { orderId, paymentId, signature } = req.body;
  const userId = req.user.id;

  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({ error: 'Order ID, Payment ID, and Signature are required' });
  }

  try {
    const payment = await verifyPayment(orderId, paymentId, signature, userId);
    res.json({
      success: true,
      message: 'Payment verified successfully',
      payment: {
        id: payment.id,
        orderId: payment.razorpay_order_id,
        paymentId: payment.razorpay_payment_id,
        amount: payment.amount,
        feature: payment.feature,
        status: payment.status,
      },
    });
  } catch (err) {
    console.error('Error verifying payment:', err);
    res.status(400).json({ error: err.message || 'Payment verification failed' });
  }
});

/**
 * GET /api/payments/history
 * Get payment history for the authenticated user
 */
router.get('/history', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const limit = Math.min(parseInt(req.query.limit) || 10, 100);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  try {
    const payments = await getPaymentHistory(userId, limit, offset);
    res.json({ payments, count: payments.length });
  } catch (err) {
    console.error('Error fetching payment history:', err);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

/**
 * GET /api/payments/check/:featureId
 * Check if user has purchased a specific feature
 */
router.get('/check/:featureId', authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { featureId } = req.params;

  try {
    const purchased = await hasUserPurchased(userId, featureId);
    res.json({
      featureId,
      purchased,
    });
  } catch (err) {
    console.error('Error checking purchase status:', err);
    res.status(500).json({ error: 'Failed to check purchase status' });
  }
});

module.exports = router;
