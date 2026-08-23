const pool = require('../config/db');
const { randomInt } = require('crypto');
const { sendMail } = require('./email');
const { otpEmail } = require('./emailTemplates');

const OTP_TTL_MINUTES = 5;
// Signup verification is not something the user is sitting and waiting for, so
// it gets a longer window than a login code.
const EMAIL_VERIFY_TTL_MINUTES = 30;

function ttlForPurpose(purpose) {
  return purpose === 'email_verify' ? EMAIL_VERIFY_TTL_MINUTES : OTP_TTL_MINUTES;
}

const OTP_PURPOSES = {
  LOGIN: 'login',
  PASSWORD_RESET: 'password_reset',
  EMAIL_VERIFY: 'email_verify',
};

// Generate a random 6-digit OTP
function generateOTP() {
  return randomInt(100000, 1000000).toString();
}

// Send OTP via email
async function sendOTPEmail(email, otp, name = 'User', expiryMinutes = OTP_TTL_MINUTES) {
  const { subject, html } = otpEmail({ name, otp, expiryMinutes });
  await sendMail({ to: email, subject, html });
  return true;
}

// Store OTP in database
async function storeOTP(email, otp, purpose = OTP_PURPOSES.LOGIN) {
  const expiresAt = new Date(Date.now() + ttlForPurpose(purpose) * 60 * 1000);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE otp_codes SET is_used = TRUE WHERE email = $1 AND purpose = $2 AND is_used = FALSE',
      [email, purpose],
    );
    await client.query(
      'INSERT INTO otp_codes (email, code, purpose, expires_at) VALUES ($1, $2, $3, $4)',
      [email, otp, purpose, expiresAt],
    );
    await client.query('COMMIT');
    console.log(`✅ OTP stored for ${email}, expires at ${expiresAt}`);
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch((rollbackError) => {
      console.error('❌ Failed to roll back OTP storage:', rollbackError);
    });
    console.error('❌ Failed to store OTP:', error);
    throw new Error('Failed to store OTP');
  } finally {
    client.release();
  }
}

// Send OTP (generate, store, and send email)
async function sendOTP(email, name = 'User', purpose = OTP_PURPOSES.LOGIN) {
  try {
    const otp = generateOTP();
    console.log(`📧 Sending OTP to ${email}...`);

    // Store OTP in database
    await storeOTP(email, otp, purpose);

    // Send OTP via email
    await sendOTPEmail(email, otp, name, ttlForPurpose(purpose));

    return { success: true, message: 'OTP sent successfully' };
  } catch (error) {
    console.error('❌ Error in sendOTP:', error);
    throw error;
  }
}

// Verify OTP
async function verifyOTP(email, otp, purpose = OTP_PURPOSES.LOGIN) {
  try {
    const result = await pool.query(
      `WITH candidate AS (
        SELECT id
        FROM otp_codes
        WHERE email = $1
          AND code = $2
          AND purpose = $3
          AND is_used = FALSE
          AND expires_at > NOW()
        ORDER BY created_at DESC
        LIMIT 1
      )
      UPDATE otp_codes
      SET is_used = TRUE
      WHERE id IN (SELECT id FROM candidate)
        AND is_used = FALSE
      RETURNING id`,
      [email, otp, purpose],
    );

    if (result.rows.length === 0) {
      console.log(`❌ OTP verification failed for ${email}`);
      return { success: false, message: 'Invalid or expired OTP' };
    }

    console.log(`✅ OTP verified for ${email}`);
    return { success: true, message: 'OTP verified successfully' };
  } catch (error) {
    console.error('❌ Error in verifyOTP:', error);
    throw error;
  }
}

// Clean up expired OTPs (optional maintenance)
async function cleanupExpiredOTPs() {
  try {
    const result = await pool.query('DELETE FROM otp_codes WHERE expires_at < NOW()');
    console.log(`✅ Cleaned up ${result.rowCount} expired OTPs`);
  } catch (error) {
    console.error('❌ Error cleaning up OTPs:', error);
  }
}

module.exports = {
  generateOTP,
  sendOTP,
  verifyOTP,
  sendOTPEmail,
  storeOTP,
  cleanupExpiredOTPs,
  OTP_PURPOSES,
  OTP_TTL_MINUTES,
  EMAIL_VERIFY_TTL_MINUTES,
  ttlForPurpose,
};
