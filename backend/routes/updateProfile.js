const express = require('express');
const pool = require('../config/db');
const authenticateToken = require('../middleware/auth');
const {
  OTP_PURPOSES,
  sendOTP,
  verifyOTP,
  sendWhatsAppOTP,
  verifyPhoneOTP,
} = require('../services/otp');
const { normalizePhoneNumber } = require('../services/whatsappService');
const { encrypt, computeBlindIndex } = require('../services/crypto');
const { logActivity } = require('../services/activityLogService');

const router = express.Router();

router.post('/request-email-update', authenticateToken, async (req, res) => {
  const { newEmail } = req.body;
  if (
    !newEmail ||
    typeof newEmail !== 'string' ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())
  ) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const emailToVerify = newEmail.trim().toLowerCase();

  try {
    const existingEmail = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [
      emailToVerify,
    ]);
    if (existingEmail.rows.length > 0) {
      return res.status(400).json({ error: 'Email address is already in use by an account.' });
    }

    await sendOTP(emailToVerify, 'User', OTP_PURPOSES.EMAIL_UPDATE);
    res.json({ success: true, message: 'OTP sent to new email' });
  } catch (error) {
    console.error('Error sending email update OTP:', error);
    res.status(500).json({ error: 'Failed to send OTP.' });
  }
});

router.post('/verify-email-update', authenticateToken, async (req, res) => {
  const { newEmail, otp } = req.body;
  if (!newEmail || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }
  const emailToVerify = newEmail.trim().toLowerCase();

  try {
    const otpResult = await verifyOTP(emailToVerify, otp, OTP_PURPOSES.EMAIL_UPDATE);
    if (!otpResult.success) {
      return res.status(400).json({ error: otpResult.message });
    }

    await pool.query(
      'UPDATE users SET email = $1, email_verified = TRUE, email_verified_at = NOW() WHERE id = $2',
      [emailToVerify, req.user.id],
    );

    await logActivity(pool, {
      userId: req.user.id,
      action: 'EMAIL_CHANGE',
      category: 'profile',
      description: 'User updated their email address',
      details: { email: emailToVerify },
      ip: req.ip,
    });

    res.json({ success: true, message: 'Email updated successfully.' });
  } catch (error) {
    console.error('Error verifying email update:', error);
    res.status(500).json({ error: 'Failed to update email.' });
  }
});

router.post('/request-phone-update', authenticateToken, async (req, res) => {
  const { newPhone } = req.body;
  if (!newPhone || typeof newPhone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(newPhone.trim())) {
    return res.status(400).json({ error: 'A valid mobile number with country code is required.' });
  }
  const phoneToVerify = newPhone.trim();

  try {
    const phoneHash = computeBlindIndex(normalizePhoneNumber(phoneToVerify));
    const existingPhone = await pool.query('SELECT id FROM users WHERE phone_hash = $1', [
      phoneHash,
    ]);
    if (existingPhone.rows.length > 0) {
      return res
        .status(400)
        .json({ error: 'Phone number is already associated with another account.' });
    }

    await sendWhatsAppOTP(phoneToVerify, '', OTP_PURPOSES.PHONE_UPDATE);
    res.json({ success: true, message: 'OTP sent to new phone via WhatsApp' });
  } catch (error) {
    console.error('Error sending phone update OTP:', error);
    res.status(500).json({ error: 'Failed to send OTP.' });
  }
});

router.post('/verify-phone-update', authenticateToken, async (req, res) => {
  const { newPhone, otp } = req.body;
  if (!newPhone || !otp) {
    return res.status(400).json({ error: 'Phone and OTP are required' });
  }
  const phoneToVerify = newPhone.trim();

  try {
    const otpResult = await verifyPhoneOTP(phoneToVerify, otp, OTP_PURPOSES.PHONE_UPDATE);
    if (!otpResult.success) {
      return res.status(400).json({ error: otpResult.message });
    }

    const encryptedPhone = encrypt(phoneToVerify);
    const phoneHash = computeBlindIndex(normalizePhoneNumber(phoneToVerify));

    await pool.query('UPDATE users SET phone = $1, phone_hash = $2 WHERE id = $3', [
      encryptedPhone,
      phoneHash,
      req.user.id,
    ]);

    await logActivity(pool, {
      userId: req.user.id,
      action: 'PHONE_CHANGE',
      category: 'profile',
      description: 'User updated their phone number',
      details: { has_phone: true },
      ip: req.ip,
    });

    res.json({ success: true, message: 'Phone updated successfully.' });
  } catch (error) {
    console.error('Error verifying phone update:', error);
    res.status(500).json({ error: 'Failed to update phone.' });
  }
});

module.exports = router;
