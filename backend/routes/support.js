const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { redactDiagnosticPayload, redactString } = require('../utils/redact');

const router = express.Router();

// In-memory rate limiting for crash reports
const crashReportAttempts = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 mins

function checkCrashReportRateLimit(ip) {
  const now = Date.now();
  const current = crashReportAttempts.get(ip);
  if (!current || current.resetAt <= now) {
    crashReportAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= RATE_LIMIT_MAX) {
    return false;
  }
  current.count += 1;
  return true;
}

// Optional auth helper
function getOptionalUserId(req) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id || null;
  } catch {
    return null;
  }
}

router.post('/crash-report', async (req, res) => {
  const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
  if (!checkCrashReportRateLimit(clientIp)) {
    return res
      .status(429)
      .json({ error: 'Too many crash reports submitted. Please try again later.' });
  }

  const {
    app_version = '1.0.0',
    page_url = '',
    browser = '',
    device_class = 'desktop',
    error_summary,
    error_details,
  } = req.body || {};

  if (!error_summary || typeof error_summary !== 'string' || !error_summary.trim()) {
    return res.status(400).json({ error: 'error_summary is required' });
  }

  if (error_details === undefined || error_details === null) {
    return res.status(400).json({ error: 'error_details is required' });
  }

  const userId = getOptionalUserId(req);

  // Redact diagnostic payload
  const sanitizedSummary = redactString(error_summary.trim()).slice(0, 500);
  const sanitizedPageUrl = redactString(String(page_url)).slice(0, 255);
  const sanitizedBrowser = redactString(String(browser)).slice(0, 100);
  const sanitizedDeviceClass = redactString(String(device_class)).slice(0, 50);
  const sanitizedAppVersion = redactString(String(app_version)).slice(0, 50);
  const sanitizedDetails = redactDiagnosticPayload(error_details);

  try {
    const result = await pool.query(
      `INSERT INTO crash_reports (
        user_id, app_version, page_url, browser, device_class, error_summary, error_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, status, created_at`,
      [
        userId,
        sanitizedAppVersion,
        sanitizedPageUrl,
        sanitizedBrowser,
        sanitizedDeviceClass,
        sanitizedSummary,
        JSON.stringify(sanitizedDetails),
      ],
    );

    res.status(201).json({
      success: true,
      reportId: result.rows[0].id,
      message: 'Crash report recorded. Thank you for helping us improve system stability.',
    });
  } catch (err) {
    console.error('Error saving crash report:', err);
    res.status(500).json({ error: 'Failed to record crash report' });
  }
});

module.exports = router;
