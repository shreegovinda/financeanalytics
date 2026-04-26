const pool = require('../config/db');
const nodemailer = require('nodemailer');

// Generate a random 6-digit OTP
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Create Nodemailer transporter using SendGrid SMTP
const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  secure: false,
  auth: {
    user: 'apikey',
    pass: process.env.SENDGRID_API_KEY,
  },
});

// Send OTP via email
async function sendOTPEmail(email, otp, name = 'User') {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error('Email service is not configured');
  }

  try {
    const mailOptions = {
      from: process.env.SENDGRID_FROM_EMAIL || 'admin@finlytix.in',
      to: email,
      subject: 'Your Finance Analytics OTP Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px 8px 0 0; color: white;">
            <h1 style="margin: 0; font-size: 24px;">Finance Analytics</h1>
            <p style="margin: 5px 0 0 0; font-size: 14px;">Secure Login</p>
          </div>

          <div style="padding: 30px; background: #f8f9fa; border: 1px solid #e0e0e0; border-radius: 0 0 8px 8px;">
            <p style="color: #333; font-size: 16px; margin-bottom: 20px;">Hi ${name},</p>

            <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
              Your one-time password (OTP) for Finance Analytics is:
            </p>

            <div style="background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #666; margin-bottom: 10px;">Enter this code to verify your identity:</p>
              <p style="margin: 0; font-size: 36px; font-weight: bold; color: #667eea; letter-spacing: 5px;">${otp}</p>
            </div>

            <p style="color: #999; font-size: 12px; margin: 20px 0;">
              This code will expire in 5 minutes. Do not share it with anyone.
            </p>

            <p style="color: #999; font-size: 12px; margin: 15px 0;">
              If you didn't request this code, please ignore this email.
            </p>

            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">

            <p style="color: #999; font-size: 12px; text-align: center; margin: 10px 0;">
              © 2026 Finance Analytics. All rights reserved.
            </p>
          </div>
        </div>
      `,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ OTP sent to ${email}:`, result.messageId);
    return true;
  } catch (error) {
    console.error('❌ Failed to send OTP email:', error);

    if (
      error.responseCode === 550 &&
      typeof error.response === 'string' &&
      error.response.includes('verified Sender Identity')
    ) {
      throw new Error('SendGrid sender identity is not verified');
    }

    throw new Error('Failed to send OTP email');
  }
}

// Store OTP in database
async function storeOTP(email, otp) {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

  try {
    await pool.query('INSERT INTO otp_codes (email, code, expires_at) VALUES ($1, $2, $3)', [
      email,
      otp,
      expiresAt,
    ]);
    console.log(`✅ OTP stored for ${email}, expires at ${expiresAt}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to store OTP:', error);
    throw new Error('Failed to store OTP');
  }
}

// Send OTP (generate, store, and send email)
async function sendOTP(email, name = 'User') {
  try {
    const otp = generateOTP();
    console.log(`📧 Sending OTP to ${email}...`);

    // Store OTP in database
    await storeOTP(email, otp);

    // Send OTP via email
    await sendOTPEmail(email, otp, name);

    return { success: true, message: 'OTP sent successfully' };
  } catch (error) {
    console.error('❌ Error in sendOTP:', error);
    throw error;
  }
}

// Verify OTP
async function verifyOTP(email, otp) {
  try {
    const result = await pool.query(
      'SELECT * FROM otp_codes WHERE email = $1 AND code = $2 AND is_used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email, otp],
    );

    if (result.rows.length === 0) {
      console.log(`❌ OTP verification failed for ${email}`);
      return { success: false, message: 'Invalid or expired OTP' };
    }

    // Mark OTP as used
    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [result.rows[0].id]);

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
};
