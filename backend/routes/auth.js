const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const authenticateToken = require('../middleware/auth');
const { OTP_PURPOSES, sendOTP, verifyOTP } = require('../services/otp');
const { issueAuthToken } = require('../services/authToken');
const {
  issueVerification,
  verifyWithToken,
  verifyWithOtp,
} = require('../services/emailVerification');

const router = express.Router();
const otpAttempts = new Map();
const OTP_MAX_ATTEMPTS = 5;
const OTP_WINDOW_MS = 15 * 60 * 1000;

function getOtpRateLimitKey(req, email, purpose) {
  return `${purpose}:${email.toLowerCase()}:${req.ip}`;
}

function checkOtpRateLimit(req, email, purpose) {
  const key = getOtpRateLimitKey(req, email, purpose);
  const now = Date.now();
  const current = otpAttempts.get(key);

  if (!current || current.resetAt <= now) {
    otpAttempts.set(key, { count: 1, resetAt: now + OTP_WINDOW_MS });
    return true;
  }

  current.count += 1;
  if (current.count > OTP_MAX_ATTEMPTS) {
    return false;
  }

  otpAttempts.set(key, current);
  return true;
}

function clearOtpRateLimit(req, email, purpose) {
  otpAttempts.delete(getOtpRateLimitKey(req, email, purpose));
}

// Register
router.post('/register', async (req, res) => {
  const { email, password, name, phone } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  try {
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, phone) VALUES ($1, $2, $3, $4) RETURNING id, email, name, phone, token_version, email_verified',
      [email, hashedPassword, name, phone || null],
    );

    const user = result.rows[0];

    // No session until the address is proven. Returning a token here would make
    // verification cosmetic.
    try {
      await issueVerification({ userId: user.id, email: user.email, name: user.name });
    } catch (mailErr) {
      console.error('Failed to send verification email:', mailErr);
      // The account exists but is unusable without a code, so surface this
      // rather than reporting a success the user cannot act on.
      return res.status(502).json({
        error:
          'Account created, but the verification email could not be sent. Please request a new one.',
        requiresVerification: true,
        email: user.email,
      });
    }

    res.status(201).json({
      requiresVerification: true,
      email: user.email,
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
      message: 'Account created. Check your email for a verification link or code.',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Verify a signup with the emailed 6-digit code.
 */
router.post('/verify-email', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and verification code are required' });
  }

  try {
    if (!checkOtpRateLimit(req, email, OTP_PURPOSES.EMAIL_VERIFY)) {
      return res
        .status(429)
        .json({ error: 'Too many verification attempts. Please try again later.' });
    }

    const result = await verifyWithOtp(email, otp);
    if (!result.success) {
      return res.status(401).json({ error: result.message });
    }

    clearOtpRateLimit(req, email, OTP_PURPOSES.EMAIL_VERIFY);

    const user = result.user;
    res.json({
      token: issueAuthToken(user),
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
      message: 'Email verified successfully',
    });
  } catch (err) {
    console.error('Error verifying email:', err);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

/**
 * Verify a signup with the emailed magic link.
 *
 * POST rather than GET: the token would otherwise travel in a URL, where it
 * leaks through Referer headers, browser history, and access logs. The frontend
 * /verify-email page reads it from the query string and posts it here.
 */
router.post('/verify-email/token', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Verification token is required' });
  }

  try {
    const result = await verifyWithToken(token);
    if (!result.success) {
      const status = result.reason === 'already_verified' ? 409 : 401;
      return res.status(status).json({ error: result.message, reason: result.reason });
    }

    const user = result.user;
    res.json({
      token: issueAuthToken(user),
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
      message: 'Email verified successfully',
    });
  } catch (err) {
    console.error('Error verifying email token:', err);
    res.status(500).json({ error: 'Failed to verify email' });
  }
});

/**
 * Reissue a verification link and code.
 *
 * Always answers the same way whether or not the address exists, so this cannot
 * be used to enumerate accounts.
 */
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const genericResponse = {
    success: true,
    message: 'If that account exists and is unverified, a new verification email has been sent.',
  };

  try {
    if (!checkOtpRateLimit(req, email, OTP_PURPOSES.EMAIL_VERIFY)) {
      return res
        .status(429)
        .json({ error: 'Too many requests. Please wait before requesting another email.' });
    }

    const found = await pool.query(
      'SELECT id, email, name, email_verified FROM users WHERE LOWER(email) = LOWER($1)',
      [email],
    );

    if (found.rows.length === 0 || found.rows[0].email_verified) {
      return res.json(genericResponse);
    }

    const user = found.rows[0];
    await issueVerification({ userId: user.id, email: user.email, name: user.name });

    res.json(genericResponse);
  } catch (err) {
    console.error('Error resending verification email:', err);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

// Check if email exists
router.post('/check-email', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email_verified FROM users WHERE LOWER(email) = LOWER($1)',
      [email],
    );
    if (result.rows.length > 0) {
      return res.json({
        exists: true,
        verified: result.rows[0].email_verified,
        user: { name: result.rows[0].name },
      });
    }
    res.json({ exists: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Checked only after the password is confirmed, so this cannot be used to
    // discover which addresses are registered.
    if (!user.email_verified) {
      return res.status(403).json({
        error: 'Please verify your email before signing in.',
        requiresVerification: true,
        email: user.email,
      });
    }

    const token = issueAuthToken(user);

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/forgot-password/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const userResult = await pool.query('SELECT name FROM users WHERE email = $1', [email]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'No account found for this email' });
    }

    await sendOTP(email, userResult.rows[0].name || 'User', OTP_PURPOSES.PASSWORD_RESET);
    res.json({ success: true, message: 'Password reset OTP sent to email' });
  } catch (err) {
    console.error('Error sending password reset OTP:', err);
    res.status(500).json({
      error:
        err.message === 'Email service is not configured'
          ? 'Email service is not configured'
          : err.message === 'SendGrid sender identity is not verified'
            ? 'Support email is not verified in SendGrid'
            : 'Failed to send password reset OTP',
    });
  }
});

router.post('/forgot-password/reset', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'Email, OTP, and new password are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  try {
    if (!checkOtpRateLimit(req, email, OTP_PURPOSES.PASSWORD_RESET)) {
      return res
        .status(429)
        .json({ error: 'Too many invalid OTP attempts. Please try again later.' });
    }

    const otpResult = await verifyOTP(email, otp, OTP_PURPOSES.PASSWORD_RESET);
    if (!otpResult.success) {
      return res.status(401).json({ error: otpResult.message });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE email = $2 RETURNING id',
      [hashedPassword, email],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    clearOtpRateLimit(req, email, OTP_PURPOSES.PASSWORD_RESET);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('Error resetting password:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Send OTP
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Check if user exists to get name for email
    const userResult = await pool.query('SELECT name FROM users WHERE email = $1', [email]);
    const name = userResult.rows.length > 0 ? userResult.rows[0].name : 'User';

    // Send OTP
    await sendOTP(email, name, OTP_PURPOSES.LOGIN);
    res.json({ success: true, message: 'OTP sent to email', email });
  } catch (err) {
    console.error('Error sending OTP:', err);
    res.status(500).json({
      error:
        err.message === 'Email service is not configured'
          ? 'Email service is not configured'
          : err.message === 'SendGrid sender identity is not verified'
            ? 'Support email is not verified in SendGrid'
            : 'Failed to send OTP. Please try again.',
    });
  }
});

// Verify OTP and issue JWT token
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  try {
    if (!checkOtpRateLimit(req, email, OTP_PURPOSES.LOGIN)) {
      return res
        .status(429)
        .json({ error: 'Too many invalid OTP attempts. Please try again later.' });
    }

    // Verify OTP
    const otpResult = await verifyOTP(email, otp, OTP_PURPOSES.LOGIN);
    if (!otpResult.success) {
      return res.status(401).json({ error: otpResult.message });
    }

    // Receiving a code at this address proves the user controls it, so a
    // successful login OTP also satisfies signup verification. Without this,
    // an unverified user who can read their mail would still be locked out.
    const userResult = await pool.query(
      `UPDATE users
       SET email_verified = TRUE,
           email_verified_at = COALESCE(email_verified_at, NOW())
       WHERE LOWER(email) = LOWER($1)
       RETURNING id, email, name, phone, token_version`,
      [email],
    );
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const token = issueAuthToken(user);

    clearOtpRateLimit(req, email, OTP_PURPOSES.LOGIN);

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
      message: 'OTP verified successfully',
    });
  } catch (err) {
    console.error('Error verifying OTP:', err);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, phone FROM users WHERE id = $1', [
      req.user.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/me', authenticateToken, async (req, res) => {
  const { name, phone } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const result = await pool.query(
      'UPDATE users SET name = $1, phone = $2 WHERE id = $3 RETURNING id, email, name, phone',
      [name.trim(), phone?.trim() || null, req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.put('/password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  try {
    const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validPassword = await bcrypt.compare(currentPassword, result.rows[0].password_hash || '');
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updateResult = await pool.query(
      `UPDATE users
       SET password_hash = $1, token_version = token_version + 1
       WHERE id = $2
       RETURNING id, email, token_version`,
      [hashedPassword, req.user.id],
    );
    const token = issueAuthToken(updateResult.rows[0]);

    res.json({ success: true, message: 'Password updated successfully', token });
  } catch (err) {
    console.error('Error updating password:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

module.exports = router;
