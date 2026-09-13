const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const pool = require('../config/db');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

/**
 * POST /api/account/delete
 * Permanently deletes the user account and cascades deletion to all user-owned data.
 * Requires recent re-authentication with current password.
 */
router.post('/delete', authenticateToken, async (req, res) => {
  const { password, confirmPhrase } = req.body;
  const userId = req.user.id;

  try {
    const userResult = await pool.query(
      'SELECT id, password_hash, email FROM users WHERE id = $1',
      [userId],
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Re-authentication check
    if (user.password_hash) {
      if (!password || typeof password !== 'string') {
        return res
          .status(400)
          .json({ error: 'Your current password is required to close this account.' });
      }
      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(403).json({ error: 'Incorrect password. Account deletion cancelled.' });
      }
    } else {
      // For passwordless/OAuth users without a password_hash, require confirmation phrase
      if (confirmPhrase !== 'DELETE') {
        return res.status(400).json({
          error: 'Please enter "DELETE" to confirm closing this account.',
        });
      }
    }

    // Clean up any uploaded statement files from disk
    const filesRes = await pool.query(
      'SELECT upload_path FROM statements WHERE user_id = $1 AND upload_path IS NOT NULL',
      [userId],
    );
    for (const row of filesRes.rows) {
      if (row.upload_path && fs.existsSync(row.upload_path)) {
        try {
          fs.unlinkSync(row.upload_path);
        } catch {
          // Continue cleanup
        }
      }
    }

    // Retrieve stats for minimal compliance log
    const stmtsCountRes = await pool.query('SELECT count(*) FROM statements WHERE user_id = $1', [
      userId,
    ]);
    const txnCountRes = await pool.query('SELECT count(*) FROM transactions WHERE user_id = $1', [
      userId,
    ]);

    const statementCount = parseInt(stmtsCountRes.rows[0].count, 10);
    const transactionCount = parseInt(txnCountRes.rows[0].count, 10);
    const anonymizedUserId = crypto.createHash('sha256').update(userId).digest('hex');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Minimal audit log (zero personal financial or identity information)
      await client.query(
        `INSERT INTO account_deletion_logs (anonymized_user_id, statement_count, transaction_count)
         VALUES ($1, $2, $3)`,
        [anonymizedUserId, statementCount, transactionCount],
      );

      // Invalidate active session tokens by incrementing token version
      await client.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [
        userId,
      ]);

      // Cascade delete user row (deletes bank accounts, statements, drafts, transactions, chat, keys)
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK').catch(() => {});
      throw txErr;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      message:
        'Your account and all associated personal data have been permanently deleted from active systems.',
    });
  } catch (err) {
    console.error('Error closing account:', err);
    res.status(500).json({ error: 'Failed to close account' });
  }
});

/**
 * GET /api/account/cost-transparency
 * Returns user-specific computing, AI token, and encrypted cloud storage footprint & costs.
 */
router.get('/cost-transparency', authenticateToken, async (req, res) => {
  try {
    const { getUserCostTransparency } = require('../services/costTransparencyService');
    const transparency = await getUserCostTransparency(req.user.id);
    res.json({ success: true, transparency });
  } catch (err) {
    console.error('Error fetching cost transparency:', err);
    res.status(500).json({ error: 'Failed to calculate account cost transparency' });
  }
});

module.exports = router;
