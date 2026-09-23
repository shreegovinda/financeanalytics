const express = require('express');
const auth = require('../middleware/auth');
const pool = require('../config/db');
const { getActivityLogs, getActivitySummary } = require('../services/activityLogService');

const router = express.Router();

/**
 * GET /api/activity-logs
 * Query params: page, limit, category, action, startDate, endDate, search
 */
router.get('/', auth, async (req, res) => {
  try {
    const result = await getActivityLogs(pool, req.user.id, req.query);
    res.set('Cache-Control', 'no-store').json(result);
  } catch (error) {
    console.error('Error fetching activity logs:', error);
    res.status(500).json({ error: 'Failed to retrieve activity logs' });
  }
});

/**
 * GET /api/activity-logs/summary
 * Returns overview metrics (password changes, profile updates, recent activity)
 */
router.get('/summary', auth, async (req, res) => {
  try {
    const summary = await getActivitySummary(pool, req.user.id);
    res.set('Cache-Control', 'no-store').json({ summary });
  } catch (error) {
    console.error('Error fetching activity summary:', error);
    res.status(500).json({ error: 'Failed to retrieve activity summary' });
  }
});

module.exports = router;
