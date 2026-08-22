const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

// The Razorpay secret must exist before payment.js is required, since the
// module reads it when verifying signatures.
process.env.RAZORPAY_KEY_SECRET = 'test_secret_do_not_use_in_production';

const {
  verifyPaymentSignature,
  getFeaturePricing,
  PREMIUM_FEATURES,
} = require('../services/payment');

const SECRET = process.env.RAZORPAY_KEY_SECRET;

function sign(orderId, paymentId, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

test('verifyPaymentSignature: accepts a correctly signed payment', () => {
  const orderId = 'order_ABC123';
  const paymentId = 'pay_XYZ789';

  assert.equal(verifyPaymentSignature(orderId, paymentId, sign(orderId, paymentId)), true);
});

test('verifyPaymentSignature: rejects a forged or altered signature', () => {
  const orderId = 'order_ABC123';
  const paymentId = 'pay_XYZ789';
  const valid = sign(orderId, paymentId);

  assert.equal(verifyPaymentSignature(orderId, paymentId, 'deadbeef'), false);
  assert.equal(verifyPaymentSignature(orderId, paymentId, ''), false);
  assert.equal(verifyPaymentSignature(orderId, paymentId, valid.toUpperCase()), false);
  assert.equal(
    verifyPaymentSignature(orderId, paymentId, sign(orderId, paymentId, 'wrong_secret')),
    false,
    'a signature from a different secret must not verify',
  );
});

test('verifyPaymentSignature: signature is bound to both order and payment id', () => {
  const valid = sign('order_ABC123', 'pay_XYZ789');

  assert.equal(
    verifyPaymentSignature('order_DIFFERENT', 'pay_XYZ789', valid),
    false,
    'replaying a signature against another order must fail',
  );
  assert.equal(
    verifyPaymentSignature('order_ABC123', 'pay_DIFFERENT', valid),
    false,
    'replaying a signature against another payment must fail',
  );
});

test('verifyPaymentSignature: never throws on malformed input', () => {
  for (const bad of [null, undefined, 12345, {}, []]) {
    assert.equal(verifyPaymentSignature('order_A', 'pay_B', bad), false);
  }
});

test('getFeaturePricing: converts paisa to rupees and hides nothing else', () => {
  const pricing = getFeaturePricing();

  assert.equal(pricing.advanced_analytics.amount, 499);
  assert.equal(pricing.data_export.amount, 299);
  assert.equal(pricing.custom_reports.amount, 999);
  assert.equal(pricing.ai_insights.amount, 799);

  for (const feature of Object.values(pricing)) {
    assert.ok(feature.name, 'every feature exposes a name');
    assert.ok(feature.description, 'every feature exposes a description');
  }
});

test('every premium feature price is a positive whole number of paisa', () => {
  for (const [id, feature] of Object.entries(PREMIUM_FEATURES)) {
    assert.ok(Number.isInteger(feature.amount), `${id} amount must be integer paisa`);
    assert.ok(feature.amount > 0, `${id} amount must be positive`);
    assert.equal(feature.amount % 100, 0, `${id} should be a whole rupee amount`);
  }
});

// KNOWN BUG — see SECURITY_AND_QUALITY_AUDIT.md.
// createOrder guards with `if (!PREMIUM_FEATURES[featureId])`, which walks the
// prototype chain. Inherited Object members are truthy, so they slip past the
// "Invalid feature ID" check and reach Razorpay with amount === undefined.
// Fix: use Object.prototype.hasOwnProperty.call(PREMIUM_FEATURES, featureId).
test('inherited Object keys pass the truthiness guard used by createOrder', () => {
  for (const key of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
    assert.ok(PREMIUM_FEATURES[key], `${key} is truthy and would bypass the feature-id check`);
    assert.equal(
      PREMIUM_FEATURES[key].amount,
      undefined,
      `${key} has no price, so an order would be created with amount undefined`,
    );
  }
});

test('hasOwnProperty check correctly rejects inherited keys', () => {
  const isRealFeature = (id) => Object.prototype.hasOwnProperty.call(PREMIUM_FEATURES, id);

  assert.equal(isRealFeature('advanced_analytics'), true);
  assert.equal(isRealFeature('constructor'), false);
  assert.equal(isRealFeature('toString'), false);
  assert.equal(isRealFeature('__proto__'), false);
  assert.equal(isRealFeature('nonexistent_feature'), false);
});
