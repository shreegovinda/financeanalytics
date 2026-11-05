const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const authenticateToken = require('../middleware/auth');
const {
  OTP_PURPOSES,
  sendOTP,
  sendWhatsAppOTP,
  verifyOTP,
  verifyPhoneOTP,
} = require('../services/otp');
const { safeDecrypt } = require('../services/crypto');
const { logActivity } = require('../services/activityLogService');
const { issueAuthToken } = require('../services/authToken');
const { validatePassword } = require('../utils/passwordValidation');

const router = express.Router();

router.post('/send-otp', authenticateToken, async (req, res) => {
  const { method } = req.body;
  if (method !== 'email' && method !== 'phone') {
    return res.status(400).json({ error: 'Method must be email or phone' });
  }

  try {
    const userResult = await pool.query('SELECT email, phone, name FROM users WHERE id = $1', [
      req.user.id,
    ]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = userResult.rows[0];

    if (method === 'email') {
      const name = user.name ? safeDecrypt(user.name) : 'User';
      await sendOTP(user.email, name, OTP_PURPOSES.PASSWORD_CHANGE);
      return res.json({ success: true, message: 'OTP sent to email' });
    } else {
      if (!user.phone) {
        return res.status(400).json({ error: 'No phone number associated with this account' });
      }
      const phone = safeDecrypt(user.phone);
      await sendWhatsAppOTP(phone, '', OTP_PURPOSES.PASSWORD_CHANGE);
      return res.json({ success: true, message: 'OTP sent to phone via WhatsApp' });
    }
  } catch (error) {
    console.error('Error sending password change OTP:', error);
    res.status(500).json({ error: 'Failed to send OTP.' });
  }
});

router.put('/change', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword, otp, method } = req.body;

  if (!currentPassword || !newPassword || !otp || !method) {
    return res
      .status(400)
      .json({ error: 'Current password, new password, OTP, and method are required' });
  }

  const passwordCheck = validatePassword(newPassword);
  if (!passwordCheck.valid) {
    return res.status(400).json({ error: passwordCheck.message });
  }

  try {
    const result = await pool.query('SELECT password_hash, email, phone FROM users WHERE id = $1', [
      req.user.id,
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(currentPassword, user.password_hash || '');
    if (!validPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    if (method === 'email') {
      const otpResult = await verifyOTP(user.email, otp, OTP_PURPOSES.PASSWORD_CHANGE);
      if (!otpResult.success) {
        return res.status(401).json({ error: otpResult.message });
      }
    } else if (method === 'phone') {
      if (!user.phone) return res.status(400).json({ error: 'No phone number on account' });
      const phone = safeDecrypt(user.phone);
      const otpResult = await verifyPhoneOTP(phone, otp, OTP_PURPOSES.PASSWORD_CHANGE);
      if (!otpResult.success) {
        return res.status(401).json({ error: otpResult.message });
      }
    } else {
      return res.status(400).json({ error: 'Invalid method' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updateResult = await pool.query(
      `UPDATE users
       SET password_hash = $1, token_version = token_version + 1, password_changed_at = NOW()
       WHERE id = $2
       RETURNING id, email, name, phone, token_version`,
      [hashedPassword, req.user.id],
    );

    const token = issueAuthToken(updateResult.rows[0]);

    await logActivity(pool, {
      userId: req.user.id,
      action: 'PASSWORD_CHANGE',
      category: 'security',
      description: 'Password updated with OTP verification',
      details: { method },
      ip: req.ip,
    });

    res.json({ success: true, message: 'Password updated successfully', token });
  } catch (err) {
    console.error('Error updating password:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

module.exports = router;
