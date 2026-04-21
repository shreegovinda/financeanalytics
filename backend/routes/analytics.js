const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/pie', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        COALESCE(c.name, t.ai_suggested_category, 'Uncategorized') as category,
        SUM(t.amount) as total,
        COUNT(*) as count
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1 AND t.type = 'debit'
      GROUP BY c.name, t.ai_suggested_category
      ORDER BY total DESC`,
      [req.user.id],
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching pie chart data:', err);
    res.status(500).json({ error: 'Failed to fetch pie chart data' });
  }
});

router.get('/bar', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        to_char(date, 'YYYY-MM') as month,
        SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'debit' THEN amount ELSE 0 END) as expenses
      FROM transactions
      WHERE user_id = $1
      GROUP BY to_char(date, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12`,
      [req.user.id],
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching bar chart data:', err);
    res.status(500).json({ error: 'Failed to fetch bar chart data' });
  }
});

router.get('/trends', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        to_char(date, 'YYYY-MM') as month,
        COALESCE(c.name, 'Other') as category,
        SUM(t.amount) as total
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1 AND t.type = 'debit'
      GROUP BY to_char(date, 'YYYY-MM'), c.name
      ORDER BY month DESC, total DESC`,
      [req.user.id],
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching trends:', err);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

module.exports = router;
