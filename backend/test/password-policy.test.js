const assert = require('node:assert/strict');
const test = require('node:test');
const { validatePassword } = require('../utils/passwordValidation');

test('validatePassword rejects passwords shorter than 8 characters', () => {
  const result = validatePassword('Ab1!xyz');
  assert.equal(result.valid, false);
  assert.match(result.message, /at least 8 characters/);
});

test('validatePassword rejects a missing or empty password', () => {
  for (const value of [undefined, null, '']) {
    const result = validatePassword(value);
    assert.equal(result.valid, false, `expected ${String(value)} to be rejected`);
  }
});

test('validatePassword rejects passwords longer than 100 characters', () => {
  const result = validatePassword(`${'Aa1!'.repeat(26)}xyz`);
  assert.equal(result.valid, false);
  assert.match(result.message, /too long/);
});

test('validatePassword requires each character class', () => {
  const cases = {
    'no uppercase': 'password123!',
    'no lowercase': 'PASSWORD123!',
    'no number': 'PasswordAbc!',
    'no special character': 'Password1234',
  };

  for (const [label, password] of Object.entries(cases)) {
    const result = validatePassword(password);
    assert.equal(result.valid, false, `expected "${label}" to be rejected`);
    assert.match(result.message, /uppercase/);
  }
});

test('validatePassword accepts a compliant password', () => {
  const result = validatePassword('Password123!');
  assert.equal(result.valid, true);
});

test('validatePassword accepts passwords at the length boundaries', () => {
  assert.equal(validatePassword('Abcdef1!').valid, true, '8 characters should be accepted');

  const atMax = `Aa1!${'b'.repeat(96)}`;
  assert.equal(atMax.length, 100);
  assert.equal(validatePassword(atMax).valid, true, '100 characters should be accepted');
});
