const express = require('express');
const pool = require('../config/db');
const authenticateToken = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const {
  sendOTP,
  sendWhatsAppOTP,
  verifyOTP,
  verifyPhoneOTP,
  OTP_PURPOSES,
} = require('../services/otp');
const { safeDecrypt } = require('../services/crypto');
const { logActivity } = require('../services/activityLogService');

const router = express.Router();

// Get current 2FA status
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT two_factor_method FROM users WHERE id = $1', [
      req.user.id,
    ]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ method: result.rows[0].two_factor_method || 'none' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch 2FA status' });
  }
});

// Setup Authenticator
router.post('/setup-authenticator', authenticateToken, async (req, res) => {
  try {
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.id]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const email = userResult.rows[0].email;
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(email, 'FinanceAnalytics', secret);

    const qrCode = await QRCode.toDataURL(otpauth);
    res.json({ secret, qrCode });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to setup authenticator' });
  }
});

// Send an enrollment OTP for the email or phone 2FA methods. Issued under the
// TWO_FACTOR purpose so /enable can verify it.
router.post('/send-otp', authenticateToken, async (req, res) => {
  const { method } = req.body;
  if (method !== 'email' && method !== 'phone') {
    return res.status(400).json({ error: 'Method must be email or phone' });
  }

  try {
    const userResult = await pool.query('SELECT email, phone, name FROM users WHERE id = $1', [
      req.user.id,
    ]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];

    if (method === 'email') {
      const name = user.name ? safeDecrypt(user.name) : 'User';
      await sendOTP(user.email, name, OTP_PURPOSES.TWO_FACTOR);
      return res.json({ success: true, message: 'Verification code sent to email' });
    }

    if (!user.phone) {
      return res.status(400).json({ error: 'No phone number associated with this account' });
    }
    const phone = safeDecrypt(user.phone);
    await sendWhatsAppOTP(phone, '', OTP_PURPOSES.TWO_FACTOR);
    return res.json({ success: true, message: 'Verification code sent to phone via WhatsApp' });
  } catch (err) {
    console.error('Error sending 2FA enrollment OTP:', err);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// Enable 2FA
router.post('/enable', authenticateToken, async (req, res) => {
  const { method, secret, otp } = req.body;
  if (!method || !otp) return res.status(400).json({ error: 'Method and OTP are required' });

  try {
    const userResult = await pool.query('SELECT email, phone FROM users WHERE id = $1', [
      req.user.id,
    ]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userResult.rows[0];

    if (method === 'authenticator') {
      if (!secret) return res.status(400).json({ error: 'Secret is required for authenticator' });
      const isValid = authenticator.verify({ token: otp, secret });
      if (!isValid) return res.status(400).json({ error: 'Invalid authenticator code' });

      await pool.query(
        'UPDATE users SET two_factor_method = $1, two_factor_secret = $2 WHERE id = $3',
        ['authenticator', secret, req.user.id],
      );
    } else if (method === 'email') {
      const otpResult = await verifyOTP(user.email, otp, OTP_PURPOSES.TWO_FACTOR);
      if (!otpResult.success) return res.status(400).json({ error: otpResult.message });

      await pool.query(
        'UPDATE users SET two_factor_method = $1, two_factor_secret = NULL WHERE id = $2',
        ['email', req.user.id],
      );
    } else if (method === 'phone') {
      if (!user.phone) return res.status(400).json({ error: 'No phone number on account' });
      const phone = safeDecrypt(user.phone);
      const otpResult = await verifyPhoneOTP(phone, otp, OTP_PURPOSES.TWO_FACTOR);
      if (!otpResult.success) return res.status(400).json({ error: otpResult.message });

      await pool.query(
        'UPDATE users SET two_factor_method = $1, two_factor_secret = NULL WHERE id = $2',
        ['phone', req.user.id],
      );
    } else {
      return res.status(400).json({ error: 'Invalid 2FA method' });
    }

    await logActivity(pool, {
      userId: req.user.id,
      action: 'ENABLE_2FA',
      category: 'security',
      description: '2FA enabled',
      details: { method },
      ip: req.ip,
    });
    res.json({ success: true, message: '2FA enabled successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to enable 2FA' });
  }
});

// Disable 2FA
router.post('/disable', authenticateToken, async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  try {
    const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [
      req.user.id,
    ]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const isValid = await bcrypt.compare(password, userResult.rows[0].password_hash || '');
    if (!isValid) return res.status(401).json({ error: 'Invalid password' });

    await pool.query(
      'UPDATE users SET two_factor_method = $1, two_factor_secret = NULL WHERE id = $2',
      ['none', req.user.id],
    );
    await logActivity(pool, {
      userId: req.user.id,
      action: 'DISABLE_2FA',
      category: 'security',
      description: '2FA disabled',
      details: {},
      ip: req.ip,
    });

    res.json({ success: true, message: '2FA disabled successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

module.exports = router;
