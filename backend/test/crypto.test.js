const test = require('node:test');
const assert = require('node:assert/strict');
const { encrypt, decrypt, encryptBuffer, decryptBuffer, maskKey } = require('../services/crypto');

test('crypto service encrypts and decrypts with AES-256-GCM', () => {
  const secret = 'sk-ant-api03-test-anthropic-secret-key-xyz123';
  const ciphertext = encrypt(secret);

  assert.notEqual(ciphertext, secret);
  assert.match(ciphertext, /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);

  const decrypted = decrypt(ciphertext);
  assert.equal(decrypted, secret);
});

test('crypto service encrypts and decrypts raw binary buffers', () => {
  const rawData = Buffer.from('%PDF-1.4 sample statement binary content with utf8 🚀', 'utf8');
  const packed = encryptBuffer(rawData);

  assert.ok(Buffer.isBuffer(packed));
  assert.notEqual(packed.toString('hex'), rawData.toString('hex'));
  assert.equal(packed.length, rawData.length + 28);

  const decrypted = decryptBuffer(packed);
  assert.ok(Buffer.isBuffer(decrypted));
  assert.equal(decrypted.toString('utf8'), rawData.toString('utf8'));
});

test('crypto service detects buffer tampering via auth tag', () => {
  const rawData = Buffer.from('statement file confidential binary content', 'utf8');
  const packed = encryptBuffer(rawData);

  // Flip a byte in ciphertext
  const tampered = Buffer.from(packed);
  tampered[tampered.length - 1] ^= 0xff;

  assert.throws(() => decryptBuffer(tampered), /Unsupported state or unable to authenticate data/);
});

test('crypto service detects tampering via GCM auth tag', () => {
  const secret = 'my-gemini-secret-key';
  const ciphertext = encrypt(secret);
  const [iv, authTag, cipher] = ciphertext.split(':');

  // Tamper with ciphertext by modifying the last hex byte
  const tamperedCipher = cipher.slice(0, -2) + (cipher.slice(-2) === 'aa' ? 'bb' : 'aa');
  const tamperedPayload = `${iv}:${authTag}:${tamperedCipher}`;

  assert.throws(() => decrypt(tamperedPayload), /Unsupported state or unable to authenticate data/);
});

test('crypto service rejects malformed payload format', () => {
  assert.throws(() => decrypt('not:valid'), /Malformed encrypted payload/);
  assert.throws(() => decrypt(12345), /Encrypted payload must be a string/);
  assert.throws(() => decryptBuffer(Buffer.from('short')), /too short/);
});

test('maskKey creates safe key previews without leaking full credentials', () => {
  assert.equal(maskKey('sk-1234567890abcdef'), 'sk-1...cdef');
  assert.equal(maskKey('AIzaSyD-1234567890xyz'), 'AIza...0xyz');
  assert.equal(maskKey('short'), '****');
  assert.equal(maskKey(''), '');
});

test('isEncrypted and safeDecrypt handle encrypted and legacy plaintext gracefully', () => {
  const { isEncrypted, safeDecrypt } = require('../services/crypto');
  const secret = 'Confidential salary payment of ₹1,50,000';
  const ciphertext = encrypt(secret);

  assert.equal(isEncrypted(ciphertext), true);
  assert.equal(isEncrypted('legacy unencrypted text'), false);
  assert.equal(isEncrypted(''), false);
  assert.equal(isEncrypted(null), false);

  // safeDecrypt decrypts valid ciphertext
  assert.equal(safeDecrypt(ciphertext), secret);
  // safeDecrypt returns legacy plaintext unchanged
  assert.equal(safeDecrypt('legacy unencrypted text'), 'legacy unencrypted text');
  assert.equal(safeDecrypt(''), '');
  assert.equal(safeDecrypt(null), null);
});

test('encryptJson and decryptJson serialize and securely encrypt JSON objects', () => {
  const { encryptJson, decryptJson } = require('../services/crypto');
  const payload = {
    transactions: [
      { date: '2026-01-15', description: 'Apollo Hospital consultation', amount: 1500 },
      { date: '2026-01-18', description: 'Salary deposit Infosys', amount: 95000 },
    ],
    accountNumber: '9876543210',
  };

  const encrypted = encryptJson(payload);
  assert.notEqual(encrypted, JSON.stringify(payload));
  assert.match(encrypted, /^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);

  const decrypted = decryptJson(encrypted);
  assert.deepEqual(decrypted, payload);

  // Handles already-parsed object or legacy JSON string
  assert.deepEqual(decryptJson(payload), payload);
  assert.equal(decryptJson(null), null);
});

test('computeBlindIndex produces deterministic irreversible HMAC digests', () => {
  const { computeBlindIndex } = require('../services/crypto');
  const phone1 = '919876543210';
  const phone2 = '919876543210';
  const phone3 = '919876543211';

  const hash1 = computeBlindIndex(phone1);
  const hash2 = computeBlindIndex(phone2);
  const hash3 = computeBlindIndex(phone3);

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
  assert.equal(hash1.length, 64);
  assert.match(hash1, /^[0-9a-f]{64}$/);
  assert.equal(computeBlindIndex(null), null);
});
