const assert = require('node:assert/strict');
const test = require('node:test');

const authRoutes = require('./auth');

test('OTP verification rate limit blocks the sixth invalid attempt per email and IP', () => {
  const email = `victim-${Date.now()}@example.com`;
  const req = { ip: '203.0.113.10' };

  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal(authRoutes._test.checkOtpRateLimit(req, email), true);
  }

  assert.equal(authRoutes._test.checkOtpRateLimit(req, email), false);

  authRoutes._test.clearOtpRateLimit(req, email);
  assert.equal(authRoutes._test.checkOtpRateLimit(req, email), true);
  authRoutes._test.clearOtpRateLimit(req, email);
});
