const express = require('express');
const bcrypt = require('bcryptjs');
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
const { issueAuthToken } = require('../services/authToken');
const {
  issueVerification,
  verifyWithToken,
  verifyWithOtp,
} = require('../services/emailVerification');
const {
  isValidCurrency,
  isValidTimezone,
  isValidLocale,
  isValidLanguage,
  isValidDateFormat,
  isValidTimeFormat,
} = require('../utils/formatters');
const { isValidProvider, isValidModel } = require('../config/aiCatalogue');
const { encrypt, safeDecrypt, computeBlindIndex } = require('../services/crypto');
const { logActivity } = require('../services/activityLogService');

function sanitizeUser(user) {
  if (!user) return user;
  return {
    ...user,
    name: safeDecrypt(user.name),
    phone: safeDecrypt(user.phone),
  };
}

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
  const { email, password, name, phone, consentGiven } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Email, password, and name are required' });
  }

  if (typeof phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(phone.trim())) {
    return res
      .status(400)
      .json({ error: 'A mobile number with country code is required, for example +919876543210.' });
  }

  if (consentGiven !== true) {
    return res.status(400).json({
      error:
        'You must agree to the Terms of Service, Privacy Policy, and Cookie Policy before creating an account.',
    });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existingUser = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [
      normalizedEmail,
    ]);
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    const normalizedPhone = phone.trim();
    const encryptedName = encrypt(name.trim());
    const encryptedPhone = encrypt(normalizedPhone);
    const phoneHash = computeBlindIndex(normalizePhoneNumber(normalizedPhone));
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, name, phone, phone_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, name, phone, token_version, email_verified',
      [normalizedEmail, hashedPassword, encryptedName, encryptedPhone, phoneHash],
    );

    const user = sanitizeUser(result.rows[0]);

    const legal = require('../config/legal');
    await pool.query(
      'INSERT INTO user_consents (user_id, policy_version, ip_address, user_agent) VALUES ($1, $2, $3, $4)',
      [user.id, legal.POLICY_VERSION, req.ip || null, req.get('User-Agent') || null],
    );

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

    const user = sanitizeUser(result.user);
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

    const user = sanitizeUser(result.user);
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
    await issueVerification({ userId: user.id, email: user.email, name: safeDecrypt(user.name) });

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
        user: { name: safeDecrypt(result.rows[0].name) },
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

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const result = await pool.query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [
      normalizedEmail,
    ]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const rawUser = result.rows[0];
    const validPassword = await bcrypt.compare(password, rawUser.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Checked only after the password is confirmed, so this cannot be used to
    // discover which addresses are registered.
    if (!rawUser.email_verified) {
      return res.status(403).json({
        error: 'Please verify your email before signing in.',
        requiresVerification: true,
        email: rawUser.email,
      });
    }

    const user = sanitizeUser(rawUser);
    const token = issueAuthToken(user);

    await logActivity(pool, {
      userId: user.id,
      action: 'LOGIN',
      category: 'security',
      description: 'User logged in with password',
      details: { method: 'password' },
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

router.post('/forgot-password/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const userResult = await pool.query('SELECT name FROM users WHERE LOWER(email) = LOWER($1)', [
      normalizedEmail,
    ]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'No account found for this email' });
    }

    const name = (userResult.rows[0].name && safeDecrypt(userResult.rows[0].name)) || 'User';
    await sendOTP(normalizedEmail, name, OTP_PURPOSES.PASSWORD_RESET);
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

  const normalizedEmail = email.trim().toLowerCase();

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  try {
    if (!checkOtpRateLimit(req, normalizedEmail, OTP_PURPOSES.PASSWORD_RESET)) {
      return res
        .status(429)
        .json({ error: 'Too many invalid OTP attempts. Please try again later.' });
    }

    const otpResult = await verifyOTP(normalizedEmail, otp, OTP_PURPOSES.PASSWORD_RESET);
    if (!otpResult.success) {
      return res.status(401).json({ error: otpResult.message });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE LOWER(email) = LOWER($2) RETURNING id',
      [hashedPassword, normalizedEmail],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    clearOtpRateLimit(req, normalizedEmail, OTP_PURPOSES.PASSWORD_RESET);

    await logActivity(pool, {
      userId: result.rows[0].id,
      action: 'PASSWORD_RESET',
      category: 'security',
      description: 'Password reset successfully via email verification OTP',
      details: { method: 'otp_email' },
      ip: req.ip,
    });

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

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Check if user exists to get name for email
    const userResult = await pool.query('SELECT name FROM users WHERE LOWER(email) = LOWER($1)', [
      normalizedEmail,
    ]);
    const name = (userResult.rows.length > 0 && safeDecrypt(userResult.rows[0].name)) || 'User';

    // Send OTP
    await sendOTP(normalizedEmail, name, OTP_PURPOSES.LOGIN);
    res.json({ success: true, message: 'OTP sent to email', email: normalizedEmail });
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

    const user = sanitizeUser(userResult.rows[0]);
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
    const result = await pool.query(
      `SELECT id, email, name, phone, role, locale, timezone, currency, language,
              date_format, time_format,
              selected_ai_provider, selected_ai_model, ai_key_mode
       FROM users WHERE id = $1`,
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = sanitizeUser(result.rows[0]);
    const keysResult = await pool.query(
      'SELECT provider, key_hint, updated_at FROM user_ai_keys WHERE user_id = $1',
      [req.user.id],
    );

    res.json({
      user: {
        ...user,
        role: req.user.role || user.role || 'user',
        needsPhone: !user.phone || !user.phone.trim(),
        configuredAiKeys: keysResult.rows.map((r) => ({
          provider: r.provider,
          keyHint: r.key_hint,
          updatedAt: r.updated_at,
        })),
      },
    });
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/me', authenticateToken, async (req, res) => {
  const {
    name,
    email,
    phone,
    locale,
    timezone,
    currency,
    language,
    date_format,
    time_format,
    selected_ai_provider,
    selected_ai_model,
    ai_key_mode,
  } = req.body;

  if (name !== undefined && (!name || typeof name !== 'string' || !name.trim())) {
    return res.status(400).json({ error: 'Name cannot be empty' });
  }

  try {
    const currentUser = await pool.query(
      `SELECT phone, name, locale, id, email, timezone, currency, language,
              date_format, time_format,
              selected_ai_provider, selected_ai_model, ai_key_mode, token_version
       FROM users WHERE id = $1`,
      [req.user.id],
    );
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const current = sanitizeUser(currentUser.rows[0]);

    let finalName = current.name;
    if (name !== undefined) {
      finalName = name.trim();
    }

    let finalEmail = current.email;
    if (email !== undefined) {
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
      }
      finalEmail = email.trim().toLowerCase();
      if (finalEmail !== (current.email || '').toLowerCase()) {
        const existingEmail = await pool.query(
          'SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id != $2',
          [finalEmail, req.user.id],
        );
        if (existingEmail.rows.length > 0) {
          return res
            .status(400)
            .json({ error: 'Email address is already in use by another account.' });
        }
      }
    }

    let finalPhone = current.phone;
    if (phone !== undefined) {
      if (typeof phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(phone.trim())) {
        return res.status(400).json({
          error: 'A mobile number with country code is required, for example +919876543210.',
        });
      }
      finalPhone = phone.trim();
    } else if (!finalPhone && (name !== undefined || phone !== undefined || email !== undefined)) {
      return res.status(400).json({
        error: 'A mobile number with country code is required, for example +919876543210.',
      });
    }

    const phoneHash = finalPhone ? computeBlindIndex(normalizePhoneNumber(finalPhone)) : null;
    if (finalPhone && phoneHash) {
      const existingPhone = await pool.query(
        'SELECT id FROM users WHERE phone_hash = $1 AND id != $2',
        [phoneHash, req.user.id],
      );
      if (existingPhone.rows.length > 0) {
        return res
          .status(400)
          .json({ error: 'Phone number is already associated with another account.' });
      }
    }

    let finalLocale = current.locale || 'en-IN';
    if (locale !== undefined) {
      if (!isValidLocale(locale)) {
        return res.status(400).json({ error: 'Invalid locale tag, for example en-IN or en-US.' });
      }
      finalLocale = locale.trim();
    }

    let finalTimezone = current.timezone || 'Asia/Kolkata';
    if (timezone !== undefined) {
      if (!isValidTimezone(timezone)) {
        return res
          .status(400)
          .json({ error: 'Invalid IANA timezone, for example Asia/Kolkata or UTC.' });
      }
      finalTimezone = timezone.trim();
    }

    let finalCurrency = current.currency || 'INR';
    if (currency !== undefined) {
      const upperCurr = String(currency).trim().toUpperCase();
      if (!isValidCurrency(upperCurr)) {
        return res
          .status(400)
          .json({ error: 'Invalid currency code, must be a 3-letter ISO code like INR or USD.' });
      }
      finalCurrency = upperCurr;
    }

    let finalLanguage = current.language || 'en';
    if (language !== undefined) {
      if (!isValidLanguage(language)) {
        return res.status(400).json({ error: 'Invalid language code, for example en or hi.' });
      }
      finalLanguage = language.trim().toLowerCase();
    }

    let finalDateFormat = current.date_format || 'DD/MM/YYYY';
    if (date_format !== undefined) {
      if (!isValidDateFormat(date_format)) {
        return res.status(400).json({ error: 'Invalid date format preference.' });
      }
      finalDateFormat = date_format.trim();
    }

    let finalTimeFormat = current.time_format || '12h';
    if (time_format !== undefined) {
      if (!isValidTimeFormat(time_format)) {
        return res
          .status(400)
          .json({ error: 'Invalid time format preference, must be 12h or 24h.' });
      }
      finalTimeFormat = time_format.trim();
    }

    let finalAiProvider = current.selected_ai_provider || 'gemini';
    if (selected_ai_provider !== undefined) {
      if (!isValidProvider(selected_ai_provider)) {
        return res.status(400).json({ error: 'Invalid AI provider selected.' });
      }
      finalAiProvider = selected_ai_provider;
    }

    let finalAiModel = current.selected_ai_model || 'gemini-2.5-flash';
    if (selected_ai_model !== undefined) {
      if (!isValidModel(finalAiProvider, selected_ai_model)) {
        return res.status(400).json({ error: `Invalid model for provider ${finalAiProvider}.` });
      }
      finalAiModel = selected_ai_model;
    }

    let finalAiKeyMode = current.ai_key_mode || 'admin';
    if (ai_key_mode !== undefined) {
      if (ai_key_mode !== 'admin' && ai_key_mode !== 'personal') {
        return res.status(400).json({ error: "ai_key_mode must be either 'admin' or 'personal'." });
      }
      finalAiKeyMode = ai_key_mode;
    }

    const hasPreferences =
      locale !== undefined ||
      timezone !== undefined ||
      currency !== undefined ||
      language !== undefined ||
      date_format !== undefined ||
      time_format !== undefined ||
      selected_ai_provider !== undefined ||
      selected_ai_model !== undefined ||
      ai_key_mode !== undefined;

    const encryptedName = finalName ? encrypt(finalName) : null;
    const encryptedPhone = finalPhone ? encrypt(finalPhone) : null;

    let result;
    if (email !== undefined) {
      if (hasPreferences) {
        result = await pool.query(
          `UPDATE users
           SET name = $1, phone = $2, phone_hash = $3, email = $4, locale = $5, timezone = $6, currency = $7, language = $8,
               date_format = $9, time_format = $10,
               selected_ai_provider = $11, selected_ai_model = $12, ai_key_mode = $13
           WHERE id = $14
           RETURNING id, email, name, phone, locale, timezone, currency, language,
                     date_format, time_format,
                     selected_ai_provider, selected_ai_model, ai_key_mode, token_version`,
          [
            encryptedName,
            encryptedPhone,
            phoneHash,
            finalEmail,
            finalLocale,
            finalTimezone,
            finalCurrency,
            finalLanguage,
            finalDateFormat,
            finalTimeFormat,
            finalAiProvider,
            finalAiModel,
            finalAiKeyMode,
            req.user.id,
          ],
        );
      } else {
        result = await pool.query(
          `UPDATE users SET name = $1, phone = $2, phone_hash = $3, email = $4 WHERE id = $5
           RETURNING id, email, name, phone, locale, timezone, currency, language,
                     date_format, time_format,
                     selected_ai_provider, selected_ai_model, ai_key_mode, token_version`,
          [encryptedName, encryptedPhone, phoneHash, finalEmail, req.user.id],
        );
      }
    } else if (hasPreferences) {
      result = await pool.query(
        `UPDATE users
         SET name = $1, phone = $2, phone_hash = $3, locale = $4, timezone = $5, currency = $6, language = $7,
             date_format = $8, time_format = $9,
             selected_ai_provider = $10, selected_ai_model = $11, ai_key_mode = $12
         WHERE id = $13
         RETURNING id, email, name, phone, locale, timezone, currency, language,
                   date_format, time_format,
                   selected_ai_provider, selected_ai_model, ai_key_mode, token_version`,
        [
          encryptedName,
          encryptedPhone,
          phoneHash,
          finalLocale,
          finalTimezone,
          finalCurrency,
          finalLanguage,
          finalDateFormat,
          finalTimeFormat,
          finalAiProvider,
          finalAiModel,
          finalAiKeyMode,
          req.user.id,
        ],
      );
    } else {
      result = await pool.query(
        `UPDATE users SET name = $1, phone = $2, phone_hash = $3 WHERE id = $4
         RETURNING id, email, name, phone, locale, timezone, currency, language,
                   date_format, time_format,
                   selected_ai_provider, selected_ai_model, ai_key_mode, token_version`,
        [encryptedName, encryptedPhone, phoneHash, req.user.id],
      );
    }

    const keysResult = await pool.query(
      'SELECT provider, key_hint, updated_at FROM user_ai_keys WHERE user_id = $1',
      [req.user.id],
    );

    if (email !== undefined && finalEmail !== current.email) {
      await logActivity(pool, {
        userId: req.user.id,
        action: 'EMAIL_CHANGE',
        category: 'profile',
        description: `Email address updated to ${finalEmail}`,
        details: {
          old_email: current.email,
          new_email: finalEmail,
          before: { email: current.email },
          after: { email: finalEmail },
          changes: [{ field: 'Email', before: current.email, after: finalEmail }],
        },
        ip: req.ip,
      });
    }

    const oldDecryptedPhone = safeDecrypt(current.phone);
    if (phone !== undefined && finalPhone !== oldDecryptedPhone) {
      await logActivity(pool, {
        userId: req.user.id,
        action: 'PHONE_CHANGE',
        category: 'profile',
        description: `Mobile number updated to ${finalPhone}`,
        details: {
          old_phone: oldDecryptedPhone,
          new_phone: finalPhone,
          before: { phone: oldDecryptedPhone },
          after: { phone: finalPhone },
          changes: [{ field: 'Mobile Phone', before: oldDecryptedPhone, after: finalPhone }],
        },
        ip: req.ip,
      });
    }

    const oldDecryptedName = safeDecrypt(current.name);
    if (name !== undefined && finalName !== oldDecryptedName) {
      await logActivity(pool, {
        userId: req.user.id,
        action: 'NAME_CHANGE',
        category: 'profile',
        description: `Profile name updated to ${finalName}`,
        details: {
          old_name: oldDecryptedName,
          new_name: finalName,
          before: { name: oldDecryptedName },
          after: { name: finalName },
          changes: [{ field: 'Full Name', before: oldDecryptedName, after: finalName }],
        },
        ip: req.ip,
      });
    }

    if (
      finalLocale !== current.locale ||
      finalTimezone !== current.timezone ||
      finalCurrency !== current.currency ||
      finalLanguage !== current.language ||
      finalDateFormat !== current.date_format ||
      finalTimeFormat !== current.time_format
    ) {
      const prefChanges = [];
      if (finalCurrency !== current.currency) {
        prefChanges.push({
          field: 'Currency',
          before: current.currency || 'INR',
          after: finalCurrency,
        });
      }
      if (finalLanguage !== current.language) {
        prefChanges.push({
          field: 'Language',
          before: current.language || 'en',
          after: finalLanguage,
        });
      }
      if (finalTimezone !== current.timezone) {
        prefChanges.push({
          field: 'Timezone',
          before: current.timezone || 'Asia/Kolkata',
          after: finalTimezone,
        });
      }
      if (finalLocale !== current.locale) {
        prefChanges.push({
          field: 'Locale',
          before: current.locale || 'en-IN',
          after: finalLocale,
        });
      }
      if (finalDateFormat !== current.date_format) {
        prefChanges.push({
          field: 'Date Format',
          before: current.date_format || 'DD/MM/YYYY',
          after: finalDateFormat,
        });
      }
      if (finalTimeFormat !== current.time_format) {
        prefChanges.push({
          field: 'Time Format',
          before: current.time_format || '12h',
          after: finalTimeFormat,
        });
      }

      await logActivity(pool, {
        userId: req.user.id,
        action: 'PREFERENCES_UPDATE',
        category: 'preferences',
        description: `Regional preferences updated (${finalCurrency}, ${finalLanguage || 'en'}, ${finalTimezone}, ${finalDateFormat})`,
        details: {
          currency: finalCurrency,
          language: finalLanguage,
          timezone: finalTimezone,
          locale: finalLocale,
          date_format: finalDateFormat,
          time_format: finalTimeFormat,
          before: {
            currency: current.currency || 'INR',
            language: current.language || 'en',
            timezone: current.timezone || 'Asia/Kolkata',
            locale: current.locale || 'en-IN',
            date_format: current.date_format || 'DD/MM/YYYY',
            time_format: current.time_format || '12h',
          },
          after: {
            currency: finalCurrency,
            language: finalLanguage,
            timezone: finalTimezone,
            locale: finalLocale,
            date_format: finalDateFormat,
            time_format: finalTimeFormat,
          },
          changes: prefChanges,
        },
        ip: req.ip,
      });
    }

    if (
      finalAiProvider !== current.selected_ai_provider ||
      finalAiModel !== current.selected_ai_model ||
      finalAiKeyMode !== current.ai_key_mode
    ) {
      const aiChanges = [];
      if (finalAiProvider !== current.selected_ai_provider) {
        aiChanges.push({
          field: 'AI Provider',
          before: current.selected_ai_provider || 'gemini',
          after: finalAiProvider,
        });
      }
      if (finalAiModel !== current.selected_ai_model) {
        aiChanges.push({
          field: 'AI Model',
          before: current.selected_ai_model || 'gemini-2.5-flash',
          after: finalAiModel,
        });
      }
      if (finalAiKeyMode !== current.ai_key_mode) {
        aiChanges.push({
          field: 'Key Mode',
          before: current.ai_key_mode || 'admin',
          after: finalAiKeyMode,
        });
      }

      await logActivity(pool, {
        userId: req.user.id,
        action: 'AI_SETTINGS_UPDATE',
        category: 'preferences',
        description: `AI configuration updated to ${finalAiProvider} (${finalAiModel})`,
        details: {
          provider: finalAiProvider,
          model: finalAiModel,
          key_mode: finalAiKeyMode,
          before: {
            provider: current.selected_ai_provider || 'gemini',
            model: current.selected_ai_model || 'gemini-2.5-flash',
            key_mode: current.ai_key_mode || 'admin',
          },
          after: {
            provider: finalAiProvider,
            model: finalAiModel,
            key_mode: finalAiKeyMode,
          },
          changes: aiChanges,
        },
        ip: req.ip,
      });
    }

    const updatedUser = sanitizeUser(result.rows[0]);
    const token = issueAuthToken(updatedUser);
    res.json({
      token,
      user: {
        ...updatedUser,
        needsPhone: false,
        configuredAiKeys: keysResult.rows.map((r) => ({
          provider: r.provider,
          keyHint: r.key_hint,
          updatedAt: r.updated_at,
        })),
      },
    });
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

    await logActivity(pool, {
      userId: req.user.id,
      action: 'PASSWORD_CHANGE',
      category: 'security',
      description: 'Password updated from account settings',
      details: { method: 'settings' },
      ip: req.ip,
    });

    res.json({ success: true, message: 'Password updated successfully', token });
  } catch (err) {
    console.error('Error updating password:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

/**
 * Send WhatsApp OTP for Login or Mobile Verification
 */
router.post('/whatsapp/send-otp', async (req, res) => {
  const { phone, purpose = OTP_PURPOSES.WHATSAPP_LOGIN } = req.body;
  if (!phone || typeof phone !== 'string') {
    return res.status(400).json({ error: 'Mobile number is required' });
  }

  const normalized = normalizePhoneNumber(phone);
  if (!normalized || normalized.length < 10) {
    return res.status(400).json({ error: 'Valid mobile number with country code is required' });
  }

  if (!checkOtpRateLimit(req, normalized, purpose)) {
    return res
      .status(429)
      .json({ error: 'Too many requests. Please wait before requesting another code.' });
  }

  try {
    const phoneHash = computeBlindIndex(normalized);
    const userRes = await pool.query(
      `SELECT id, email, name, phone, phone_verified, token_version FROM users
       WHERE phone_hash = $1
       LIMIT 1`,
      [phoneHash],
    );

    if (purpose === OTP_PURPOSES.WHATSAPP_LOGIN && userRes.rows.length === 0) {
      return res.status(404).json({
        error: 'No account found matching this mobile number. Please register first.',
      });
    }

    await sendWhatsAppOTP(normalized, '', purpose);

    const maskedPhone = '+' + normalized.slice(0, 2) + '••••' + normalized.slice(-4);
    res.json({
      success: true,
      message: 'Security code sent to your WhatsApp',
      phone: maskedPhone,
    });
  } catch (err) {
    console.error('Error sending WhatsApp OTP:', err);
    res.status(500).json({ error: 'Failed to send WhatsApp security code' });
  }
});

/**
 * Verify WhatsApp OTP for Login or Mobile Verification
 */
router.post('/whatsapp/verify-otp', async (req, res) => {
  const { phone, code, purpose = OTP_PURPOSES.WHATSAPP_LOGIN } = req.body;
  if (!phone || !code) {
    return res.status(400).json({ error: 'Mobile number and verification code are required' });
  }

  const normalized = normalizePhoneNumber(phone);
  try {
    const verifyRes = await verifyPhoneOTP(normalized, String(code).trim(), purpose);
    if (!verifyRes.success) {
      return res.status(400).json({ error: verifyRes.message });
    }

    const phoneHash = computeBlindIndex(normalized);
    const userRes = await pool.query(
      `SELECT id, email, name, phone, phone_verified, email_verified, token_version, role, currency, timezone, date_format, time_format
       FROM users
       WHERE phone_hash = $1
       LIMIT 1`,
      [phoneHash],
    );

    if (userRes.rows.length === 0) {
      return res.json({
        success: true,
        message: 'Phone number verified successfully',
      });
    }

    const rawUser = userRes.rows[0];
    await pool.query(
      'UPDATE users SET phone_verified = TRUE, phone_verified_at = NOW() WHERE id = $1',
      [rawUser.id],
    );

    if (!rawUser.email_verified) {
      return res.status(403).json({
        error: 'Please verify your email before signing in.',
        requiresVerification: true,
        email: rawUser.email,
      });
    }

    const user = sanitizeUser(rawUser);
    const token = issueAuthToken(user);
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        phone_verified: true,
        role: user.role,
      },
      message: 'Authenticated successfully with WhatsApp',
    });
  } catch (err) {
    console.error('Error verifying WhatsApp OTP:', err);
    res.status(500).json({ error: 'Failed to verify WhatsApp code' });
  }
});

module.exports = router;
