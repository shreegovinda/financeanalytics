const express = require('express');
const pool = require('../config/db');
const { verifyOTP, verifyPhoneOTP, OTP_PURPOSES } = require('../services/otp');
const { safeDecrypt } = require('../services/crypto');
const { logActivity } = require('../services/activityLogService');
const { issueAuthToken } = require('../services/authToken');
const { checkOtpRateLimit, clearOtpRateLimit } = require('../utils/otpRateLimit');

const { authenticator } = require('otplib');

const router = express.Router();

router.post('/verify-login', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: 'Email and OTP are required' });

  const normalizedEmail = email.trim().toLowerCase();

  try {
    if (!checkOtpRateLimit(req, normalizedEmail, OTP_PURPOSES.TWO_FACTOR)) {
      return res.status(429).json({ error: 'Too many invalid codes. Please try again later.' });
    }

    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [
      normalizedEmail,
    ]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    const rawUser = result.rows[0];
    const method = rawUser.two_factor_method;

    if (!method || method === 'none') {
      return res.status(400).json({ error: '2FA is not enabled for this user' });
    }

    if (method === 'authenticator') {
      const isValid = authenticator.verify({ token: otp, secret: rawUser.two_factor_secret });
      if (!isValid) return res.status(401).json({ error: 'Invalid authenticator code' });
    } else if (method === 'email') {
      const otpResult = await verifyOTP(normalizedEmail, otp, OTP_PURPOSES.TWO_FACTOR);
      if (!otpResult.success) return res.status(401).json({ error: otpResult.message });
    } else if (method === 'phone') {
      const phone = safeDecrypt(rawUser.phone);
      const otpResult = await verifyPhoneOTP(phone, otp, OTP_PURPOSES.TWO_FACTOR);
      if (!otpResult.success) return res.status(401).json({ error: otpResult.message });
    }

    clearOtpRateLimit(req, normalizedEmail, OTP_PURPOSES.TWO_FACTOR);

    const user = sanitizeUser(rawUser);
    const token = issueAuthToken(user);

    await logActivity(pool, {
      userId: user.id,
      action: 'LOGIN_2FA',
      category: 'security',
      description: 'User logged in with 2FA',
      details: { method },
      ip: req.ip,
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

module.exports = router;

function sanitizeUser(user) {
  if (!user) return user;
  return {
    ...user,
    name: safeDecrypt(user.name),
    phone: safeDecrypt(user.phone),
  };
}
