const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const authenticateToken = require('../middleware/auth');
const { sendOTP, verifyOTP } = require('../services/otp');

const router = express.Router();
const resetOtpAttempts = new Map();
const RESET_OTP_MAX_ATTEMPTS = 5;
const RESET_OTP_WINDOW_MS = 15 * 60 * 1000;

function getResetOtpKey(req, email) {
  return `${email.toLowerCase()}:${req.ip}`;
}

function checkResetOtpRateLimit(req, email) {
  const key = getResetOtpKey(req, email);
  const now = Date.now();
  const current = resetOtpAttempts.get(key);

  if (!current || current.resetAt <= now) {
    resetOtpAttempts.set(key, { count: 1, resetAt: now + RESET_OTP_WINDOW_MS });
    return true;
  }

  current.count += 1;
  if (current.count > RESET_OTP_MAX_ATTEMPTS) {
    return false;
  }

  resetOtpAttempts.set(key, current);
  return true;
}

function clearResetOtpRateLimit(req, email) {
  resetOtpAttempts.delete(getResetOtpKey(req, email));
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

    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, phone) VALUES ($1, $2, $3, $4) RETURNING id, email, name, phone',
      [email, hashedPassword, name, phone || null],
    );

    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check if email exists
router.post('/check-email', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const result = await pool.query('SELECT id, name FROM users WHERE email = $1', [email]);
    if (result.rows.length > 0) {
      return res.json({ exists: true, user: { name: result.rows[0].name } });
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

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

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

    await sendOTP(email, userResult.rows[0].name || 'User');
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
    if (!checkResetOtpRateLimit(req, email)) {
      return res
        .status(429)
        .json({ error: 'Too many invalid OTP attempts. Please try again later.' });
    }

    const otpResult = await verifyOTP(email, otp);
    if (!otpResult.success) {
      return res.status(401).json({ error: otpResult.message });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id',
      [hashedPassword, email],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    clearResetOtpRateLimit(req, email);
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
    await sendOTP(email, name);
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
    // Verify OTP
    const otpResult = await verifyOTP(email, otp);
    if (!otpResult.success) {
      return res.status(401).json({ error: otpResult.message });
    }

    // Get user by email
    const userResult = await pool.query(
      'SELECT id, email, name, phone FROM users WHERE email = $1',
      [email],
    );
    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

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
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      hashedPassword,
      req.user.id,
    ]);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error('Error updating password:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

module.exports = router;
