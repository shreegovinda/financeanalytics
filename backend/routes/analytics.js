const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/pie', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        COALESCE(c.name, NULLIF(t.ai_suggested_category, ''), 'Other') as name,
        SUM(ABS(t.amount))::numeric as value
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id AND c.user_id = t.user_id
      WHERE t.user_id = $1 AND t.type = 'debit'
      GROUP BY 1
      ORDER BY value DESC`,
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
        TO_CHAR(DATE_TRUNC('month', date), 'DD/MM/YYYY') as month,
        SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END)::numeric as income,
        SUM(CASE WHEN type = 'debit' THEN ABS(amount) ELSE 0 END)::numeric as expenses
      FROM transactions
      WHERE user_id = $1
      GROUP BY DATE_TRUNC('month', date)
      ORDER BY DATE_TRUNC('month', date) ASC`,
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
        TO_CHAR(DATE_TRUNC('month', date), 'DD/MM/YYYY') as month,
        COALESCE(c.name, 'Other') as category,
        SUM(t.amount) as total
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = $1 AND t.type = 'debit'
      GROUP BY DATE_TRUNC('month', date), c.name
      ORDER BY DATE_TRUNC('month', date) DESC, total DESC`,
      [req.user.id],
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching trends:', err);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

module.exports = router;
