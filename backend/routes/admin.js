const express = require('express');
const pool = require('../config/db');
const authenticateToken = require('../middleware/auth');
const requireAdmin = require('../middleware/admin');

const router = express.Router();

// Require both authentication and admin role for all routes
router.use(authenticateToken, requireAdmin);

/**
 * GET /api/admin/metrics
 * Strictly aggregated operational metrics. Zero financial rows, transaction details, or chat logs.
 */
router.get('/metrics', async (req, res) => {
  try {
    const [
      usersResult,
      statementsResult,
      statementFilesResult,
      draftsResult,
      crashReportsResult,
      consentResult,
      deletionsResult,
      aiModeResult,
    ] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total_users,
          COUNT(*) FILTER (WHERE email_verified = TRUE)::int AS verified_users,
          COUNT(*) FILTER (WHERE role = 'admin')::int AS admin_users
        FROM users
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_statements,
          COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_statements,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_statements,
          COUNT(*) FILTER (WHERE status = 'processing')::int AS processing_statements
        FROM statements
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_files,
          COUNT(*) FILTER (WHERE is_encrypted = TRUE)::int AS encrypted_files,
          COUNT(*) FILTER (WHERE is_encrypted = FALSE)::int AS plaintext_files
        FROM statement_files
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_drafts,
          COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending_review_drafts,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_drafts
        FROM statement_drafts
      `),
      pool.query(`
        SELECT
          COUNT(*)::int AS total_crash_reports,
          COUNT(*) FILTER (WHERE status = 'open')::int AS open_crash_reports,
          COUNT(*) FILTER (WHERE status = 'investigating')::int AS investigating_crash_reports,
          COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_crash_reports
        FROM crash_reports
      `),
      pool.query(`
        SELECT consent_version, COUNT(*)::int AS user_count
        FROM user_consents
        GROUP BY consent_version
        ORDER BY consent_version DESC
      `),
      pool.query(`
        SELECT COUNT(*)::int AS total_deletions
        FROM account_deletion_logs
      `),
      pool.query(`
        SELECT ai_key_mode, COUNT(*)::int AS count
        FROM users
        GROUP BY ai_key_mode
      `),
    ]);

    res.json({
      users: usersResult.rows[0] || { total_users: 0, verified_users: 0, admin_users: 0 },
      statements: statementsResult.rows[0] || {
        total_statements: 0,
        completed_statements: 0,
        failed_statements: 0,
        processing_statements: 0,
      },
      storage: statementFilesResult.rows[0] || {
        total_files: 0,
        encrypted_files: 0,
        plaintext_files: 0,
      },
      drafts: draftsResult.rows[0] || {
        total_drafts: 0,
        pending_review_drafts: 0,
        failed_drafts: 0,
      },
      crash_reports: crashReportsResult.rows[0] || {
        total_crash_reports: 0,
        open_crash_reports: 0,
        investigating_crash_reports: 0,
        resolved_crash_reports: 0,
      },
      consent_breakdown: consentResult.rows || [],
      privacy: {
        total_account_deletions: deletionsResult.rows[0]?.total_deletions || 0,
      },
      ai_mode_distribution: aiModeResult.rows || [],
    });
  } catch (err) {
    console.error('Error fetching admin operational metrics:', err);
    res.status(500).json({ error: 'Failed to aggregate operational metrics' });
  }
});

/**
 * GET /api/admin/crash-reports
 * Paginated diagnostic crash reports.
 */
router.get('/crash-reports', async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const status = req.query.status;

    let query = `
      SELECT id, user_id, app_version, page_url, browser, device_class, error_summary, status, created_at
      FROM crash_reports
    `;
    const params = [];

    if (status && ['open', 'investigating', 'resolved'].includes(status)) {
      params.push(status);
      query += ` WHERE status = $${params.length}`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM crash_reports');
    const result = await pool.query(query, params);

    res.json({
      reports: result.rows,
      total: countResult.rows[0]?.count || 0,
      limit,
      offset,
    });
  } catch (err) {
    console.error('Error fetching crash reports:', err);
    res.status(500).json({ error: 'Failed to retrieve crash reports' });
  }
});

/**
 * GET /api/admin/crash-reports/:id
 * Single crash report with full redacted error details.
 */
router.get('/crash-reports/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, user_id, app_version, page_url, browser, device_class, error_summary, error_details, status, created_at
       FROM crash_reports WHERE id = $1`,
      [req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Crash report not found' });
    }

    res.json({ report: result.rows[0] });
  } catch (err) {
    console.error('Error fetching crash report by id:', err);
    res.status(500).json({ error: 'Failed to retrieve crash report' });
  }
});

/**
 * PATCH /api/admin/crash-reports/:id
 * Update status of a crash report.
 */
router.patch('/crash-reports/:id', async (req, res) => {
  const { status } = req.body || {};
  const validStatuses = ['open', 'investigating', 'resolved'];

  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({
      error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
    });
  }

  try {
    const result = await pool.query(
      `UPDATE crash_reports
       SET status = $1
       WHERE id = $2
       RETURNING id, status, created_at`,
      [status, req.params.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Crash report not found' });
    }

    res.json({
      success: true,
      report: result.rows[0],
    });
  } catch (err) {
    console.error('Error updating crash report status:', err);
    res.status(500).json({ error: 'Failed to update crash report status' });
  }
});

module.exports = router;
