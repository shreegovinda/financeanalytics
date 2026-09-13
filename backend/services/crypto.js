const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for AES-GCM
const AUTH_TAG_LENGTH = 16;

let warnedDevKey = false;

function getEncryptionKey() {
  const envKey = process.env.APP_ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64 && /^[0-9a-fA-F]+$/.test(envKey)) {
      return Buffer.from(envKey, 'hex');
    }
    if (Buffer.byteLength(envKey, 'utf8') === 32) {
      return Buffer.from(envKey, 'utf8');
    }
    // Attempt base64
    const b64Buf = Buffer.from(envKey, 'base64');
    if (b64Buf.length === 32) {
      return b64Buf;
    }
  }

  // Development fallback: derive deterministically from JWT_SECRET or fallback
  if (!warnedDevKey && process.env.NODE_ENV !== 'test') {
    console.warn(
      '⚠️  [SECURITY WARNING] APP_ENCRYPTION_KEY is not set or not 32 bytes. ' +
        'Using derived key for local development. Set a 32-byte hex key in production.',
    );
    warnedDevKey = true;
  }
  const secret = process.env.JWT_SECRET || 'finlytix-dev-secret-key-salt-seed';
  return crypto.scryptSync(secret, 'finlytix-app-encryption-salt', 32);
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns formatted string: "iv:authTag:ciphertext" (in hex).
 */
function encrypt(plaintext) {
  if (typeof plaintext !== 'string') {
    throw new Error('Plaintext must be a string');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
}

/**
 * Decrypt AES-256-GCM formatted ciphertext string.
 * Throws if authentication tag does not match (tampering or wrong key).
 */
function decrypt(encryptedString) {
  if (typeof encryptedString !== 'string') {
    throw new Error('Encrypted payload must be a string');
  }

  const parts = encryptedString.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload');
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid IV or auth tag length');
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypt a raw binary Buffer using AES-256-GCM.
 * Returns a packed Buffer: [12-byte IV][16-byte AuthTag][Ciphertext bytes].
 */
function encryptBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Input must be a Buffer');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]);
}

/**
 * Decrypt a packed AES-256-GCM Buffer: [12-byte IV][16-byte AuthTag][Ciphertext bytes].
 * Returns original unencrypted binary Buffer.
 */
function decryptBuffer(packedBuffer) {
  if (!Buffer.isBuffer(packedBuffer)) {
    throw new Error('Input must be a Buffer');
  }

  if (packedBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Packed buffer is too short to contain valid IV and AuthTag');
  }

  const iv = packedBuffer.subarray(0, IV_LENGTH);
  const authTag = packedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Produces a safe preview/hint of an API key, e.g. "sk-a...7b9c".
 * Never reveals more than 4 initial and 4 trailing characters.
 */
function maskKey(key) {
  if (typeof key !== 'string' || !key.trim()) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}

/**
 * Test whether a string is an AES-256-GCM formatted ciphertext: "iv:authTag:ciphertext"
 */
function isEncrypted(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  const [ivHex, tagHex, cipherHex] = parts;
  // iv is 12 bytes = 24 hex chars; tag is 16 bytes = 32 hex chars
  if (ivHex.length !== 24 || tagHex.length !== 32) return false;
  return (
    /^[0-9a-fA-F]+$/.test(ivHex) &&
    /^[0-9a-fA-F]+$/.test(tagHex) &&
    /^[0-9a-fA-F]*$/.test(cipherHex)
  );
}

/**
 * Safely decrypt an AES-256-GCM encrypted string.
 * If value is null, undefined, not a string, or not in encrypted format (legacy plaintext),
 * it returns the original value unchanged.
 */
function safeDecrypt(value) {
  if (!value || typeof value !== 'string') return value;
  if (!isEncrypted(value)) return value;
  try {
    return decrypt(value);
  } catch {
    // If decryption fails (tampered or wrong key), return original
    return value;
  }
}

/**
 * Encrypt a JSON-serializable object into an AES-256-GCM encrypted string.
 */
function encryptJson(obj) {
  if (obj === null || obj === undefined) return null;
  const jsonStr = typeof obj === 'string' ? obj : JSON.stringify(obj);
  return encrypt(jsonStr);
}

/**
 * Decrypt an AES-256-GCM encrypted string and parse as JSON.
 * Returns parsed object or fallback to plaintext.
 */
function decryptJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  const decrypted = safeDecrypt(value);
  if (typeof decrypted !== 'string') return decrypted;
  try {
    return JSON.parse(decrypted);
  } catch {
    return decrypted;
  }
}

/**
 * Compute an irreversible cryptographic blind index (HMAC-SHA256)
 * for exact match database indexing without exposing plaintexts (e.g. phone numbers).
 */
function computeBlindIndex(value) {
  if (!value) return null;
  const normalized = String(value).trim();
  const key = getEncryptionKey();
  return crypto.createHmac('sha256', key).update(normalized).digest('hex');
}

module.exports = {
  encrypt,
  decrypt,
  isEncrypted,
  safeDecrypt,
  encryptJson,
  decryptJson,
  computeBlindIndex,
  encryptBuffer,
  decryptBuffer,
  maskKey,
  getEncryptionKey,
};
