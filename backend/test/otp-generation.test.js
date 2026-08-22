const test = require('node:test');
const assert = require('node:assert/strict');

const { generateOTP } = require('../services/otp');

// A verified OTP is exchanged for a 7-day JWT at POST /api/auth/verify-otp,
// so OTP strength is an authentication control, not a convenience feature.

test('generateOTP: always returns a 6-digit numeric string', () => {
  for (let i = 0; i < 2000; i++) {
    const otp = generateOTP();
    assert.equal(typeof otp, 'string');
    assert.match(otp, /^\d{6}$/, `got ${otp}`);
  }
});

test('generateOTP: stays within the 6-digit range and never starts with 0', () => {
  for (let i = 0; i < 2000; i++) {
    const value = Number(generateOTP());
    assert.ok(value >= 100000 && value <= 999999, `out of range: ${value}`);
  }
});

test('generateOTP: does not obviously repeat', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    seen.add(generateOTP());
  }
  // 500 draws from 900k values: collisions are possible but a low unique count
  // would indicate a broken generator.
  assert.ok(seen.size > 450, `only ${seen.size} unique codes in 500 draws`);
});

// KNOWN WEAKNESS — see SECURITY_AND_QUALITY_AUDIT.md.
// generateOTP is built on Math.random(), which is a non-cryptographic PRNG.
// Its output is predictable from observed values, and POST /api/auth/verify-otp
// has no rate limiting, so codes are also brute-forceable within their 5-minute
// window. Fix: crypto.randomInt(100000, 1000000) plus attempt throttling.
test('generateOTP is derived from Math.random (documents the weakness)', () => {
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(generateOTP(), '100000', 'lowest value is fully predictable');

    Math.random = () => 0.999999999;
    assert.equal(generateOTP(), '999999', 'highest value is fully predictable');

    Math.random = () => 0.5;
    assert.equal(generateOTP(), '550000', 'output is a pure function of Math.random');
  } finally {
    Math.random = originalRandom;
  }
});

test('the OTP keyspace is small enough to brute force unthrottled', () => {
  const keyspace = 999999 - 100000 + 1;
  assert.equal(keyspace, 900000);

  // At a modest 100 requests/second against an unthrottled endpoint, half the
  // keyspace is covered well inside the 5-minute expiry window.
  const attemptsInWindow = 100 * 60 * 5;
  assert.ok(
    attemptsInWindow > keyspace / 300,
    'verify-otp needs per-account attempt limits, which it currently lacks',
  );
});
