const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { hashToken, generateLinkToken, buildVerifyUrl } = require('../services/emailVerification');

// Magic-link tokens are the credential that activates an account, so their
// generation, storage form, and URL construction are pinned down here.

test('link tokens are long, random, and URL-safe', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const token = generateLinkToken();
    assert.match(token, /^[A-Za-z0-9_-]+$/, `not URL-safe: ${token}`);
    // 32 random bytes in base64url.
    assert.ok(token.length >= 42, `suspiciously short: ${token.length} chars`);
    seen.add(token);
  }
  assert.equal(seen.size, 500, 'every generated token must be unique');
});

test('only a SHA-256 hash of the token is ever persisted', () => {
  // A database dump must not be replayable into account activations.
  const token = generateLinkToken();
  const hash = hashToken(token);

  assert.equal(hash.length, 64, 'hex-encoded SHA-256');
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.notEqual(hash, token);
  assert.equal(hash, crypto.createHash('sha256').update(token).digest('hex'));
});

test('hashing is deterministic and collision-free across tokens', () => {
  const a = generateLinkToken();
  const b = generateLinkToken();

  assert.equal(hashToken(a), hashToken(a), 'same input, same hash');
  assert.notEqual(hashToken(a), hashToken(b), 'different inputs, different hashes');
});

test('a near-miss token does not hash to the same value', () => {
  const token = 'abcdefghijklmnopqrstuvwxyz012345';
  assert.notEqual(hashToken(token), hashToken(token + 'x'));
  assert.notEqual(hashToken(token), hashToken(token.toUpperCase()));
});

test('verify URLs point at the frontend and percent-encode the token', () => {
  const saved = process.env.FRONTEND_URL;
  try {
    process.env.FRONTEND_URL = 'https://app.finlytix.in';
    assert.equal(buildVerifyUrl('abc123'), 'https://app.finlytix.in/verify-email?token=abc123');

    // A trailing slash must not produce a double slash in the path.
    process.env.FRONTEND_URL = 'https://app.finlytix.in/';
    assert.equal(buildVerifyUrl('abc123'), 'https://app.finlytix.in/verify-email?token=abc123');

    // base64url never contains these, but the encoding must hold regardless.
    process.env.FRONTEND_URL = 'https://app.finlytix.in';
    assert.equal(
      buildVerifyUrl('a+b/c=d&e'),
      'https://app.finlytix.in/verify-email?token=a%2Bb%2Fc%3Dd%26e',
    );
  } finally {
    if (saved === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = saved;
    }
  }
});

test('OTP purposes are distinct so a code cannot cross flows', () => {
  const { OTP_PURPOSES, ttlForPurpose } = require('../services/otp');

  const values = Object.values(OTP_PURPOSES);
  assert.equal(new Set(values).size, values.length, 'purpose values must be unique');
  assert.ok(values.includes('email_verify'));

  // Signup verification is not something a user waits on, so it gets longer.
  assert.ok(
    ttlForPurpose('email_verify') > ttlForPurpose('login'),
    'verification should outlive a login code',
  );
});
