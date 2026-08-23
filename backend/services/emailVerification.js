const crypto = require('crypto');
const pool = require('../config/db');
const { sendMail } = require('./email');
const { verificationEmail } = require('./emailTemplates');
const {
  generateOTP,
  storeOTP,
  verifyOTP,
  OTP_PURPOSES,
  EMAIL_VERIFY_TTL_MINUTES,
} = require('./otp');

/**
 * Signup email verification.
 *
 * One email carries both a one-click magic link and a 6-digit code. The link is
 * the happy path; the code is the fallback for mail clients that rewrite or
 * strip links, and for reading the mail on a different device from the browser.
 *
 * Only a SHA-256 hash of the link token is persisted, so a database dump cannot
 * be replayed into account activations. The raw token exists solely in the
 * email body.
 */

const TOKEN_BYTES = 32;

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

function generateLinkToken() {
  return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

function getFrontendBaseUrl() {
  return (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function buildVerifyUrl(rawToken) {
  return `${getFrontendBaseUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
}

/**
 * Issues a fresh verification challenge and emails it.
 *
 * Any outstanding link tokens for the user are invalidated first, so a resend
 * cannot leave several live links pointing at one account.
 */
async function issueVerification({ userId, email, name }) {
  const rawToken = generateLinkToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_MINUTES * 60 * 1000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE email_verification_tokens
       SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );
    await client.query(
      `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt],
    );
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed while issuing verification token:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }

  // storeOTP supersedes any previous unused email_verify code for this address.
  const otp = generateOTP();
  await storeOTP(email, otp, OTP_PURPOSES.EMAIL_VERIFY);

  const { subject, html } = verificationEmail({
    name: name || 'there',
    otp,
    verifyUrl: buildVerifyUrl(rawToken),
    expiryMinutes: EMAIL_VERIFY_TTL_MINUTES,
  });

  await sendMail({ to: email, subject, html });

  return { expiresAt };
}

async function markVerified(client, userId) {
  const result = await client.query(
    `UPDATE users
     SET email_verified = TRUE,
         email_verified_at = COALESCE(email_verified_at, NOW())
     WHERE id = $1
     RETURNING id, email, name, phone, token_version, email_verified`,
    [userId],
  );
  return result.rows[0] || null;
}

/**
 * Consumes a magic-link token.
 *
 * The UPDATE ... WHERE used_at IS NULL and the RETURNING clause make claiming
 * the token atomic, so two concurrent clicks cannot both succeed.
 */
async function verifyWithToken(rawToken) {
  if (!rawToken) {
    return { success: false, reason: 'invalid', message: 'Verification link is invalid.' };
  }

  const tokenHash = hashToken(rawToken);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const claimed = await client.query(
      `UPDATE email_verification_tokens
       SET used_at = NOW()
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       RETURNING user_id`,
      [tokenHash],
    );

    if (claimed.rows.length === 0) {
      // Distinguish "already verified" from "bad link" so the UI can tell the
      // user something useful when they click a link twice.
      const existing = await client.query(
        `SELECT u.id, u.email_verified
         FROM email_verification_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = $1`,
        [tokenHash],
      );
      await client.query('COMMIT');

      if (existing.rows.length > 0 && existing.rows[0].email_verified) {
        return {
          success: false,
          reason: 'already_verified',
          message: 'This email is already verified. You can sign in.',
        };
      }
      return {
        success: false,
        reason: 'invalid',
        message: 'Verification link is invalid or has expired. Request a new one.',
      };
    }

    const user = await markVerified(client, claimed.rows[0].user_id);
    await client.query('COMMIT');

    return { success: true, user };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed while verifying token:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Consumes an emailed verification code. verifyOTP already handles single-use
 * and expiry atomically.
 */
async function verifyWithOtp(email, otp) {
  const otpResult = await verifyOTP(email, otp, OTP_PURPOSES.EMAIL_VERIFY);
  if (!otpResult.success) {
    return { success: false, reason: 'invalid', message: otpResult.message };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [
      email,
    ]);

    if (found.rows.length === 0) {
      await client.query('COMMIT');
      return { success: false, reason: 'invalid', message: 'Account not found.' };
    }

    const userId = found.rows[0].id;
    const user = await markVerified(client, userId);

    // A successful code also retires any outstanding link for the same account.
    await client.query(
      `UPDATE email_verification_tokens
       SET used_at = NOW()
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId],
    );

    await client.query('COMMIT');
    return { success: true, user };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed while verifying OTP:', rollbackErr);
    }
    throw err;
  } finally {
    client.release();
  }
}

async function cleanupExpiredVerificationTokens() {
  try {
    const result = await pool.query(
      `DELETE FROM email_verification_tokens
       WHERE expires_at < NOW() - INTERVAL '7 days'`,
    );
    console.log(`✅ Cleaned up ${result.rowCount} expired verification tokens`);
  } catch (err) {
    console.error('❌ Error cleaning up verification tokens:', err);
  }
}

module.exports = {
  issueVerification,
  verifyWithToken,
  verifyWithOtp,
  cleanupExpiredVerificationTokens,
  hashToken,
  buildVerifyUrl,
  generateLinkToken,
};
