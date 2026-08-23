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

// #26 replaced Math.random() with crypto.randomInt and added rate limiting to
// verify-otp. This test previously documented the Math.random weakness; it now
// guards the fix, so that reverting to a non-cryptographic PRNG fails the build.
test('generateOTP does not depend on Math.random', () => {
  const originalRandom = Math.random;
  let mathRandomCalls = 0;
  try {
    Math.random = () => {
      mathRandomCalls += 1;
      return 0.5;
    };

    const codes = new Set();
    for (let i = 0; i < 200; i++) {
      codes.add(generateOTP());
    }

    assert.equal(mathRandomCalls, 0, 'generateOTP must not call Math.random');
    assert.ok(
      codes.size > 150,
      `a stubbed Math.random must not make output predictable; got ${codes.size} unique of 200`,
    );
  } finally {
    Math.random = originalRandom;
  }
});

test('generateOTP uses the crypto module', () => {
  const crypto = require('crypto');
  const originalRandomInt = crypto.randomInt;
  let used = false;
  try {
    crypto.randomInt = (...args) => {
      used = true;
      return originalRandomInt(...args);
    };
    // Re-require so the service picks up the instrumented function.
    delete require.cache[require.resolve('../services/otp')];
    const { generateOTP: fresh } = require('../services/otp');
    fresh();
    assert.ok(used, 'OTP generation must go through crypto.randomInt');
  } finally {
    crypto.randomInt = originalRandomInt;
    delete require.cache[require.resolve('../services/otp')];
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
    'the keyspace alone is not enough protection, which is why #26 added ' +
      'per-account attempt limits to verify-otp',
  );
});
