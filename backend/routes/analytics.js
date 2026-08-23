const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

function parseDateFilter(value, fieldName) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const err = new Error(`Invalid ${fieldName}`);
    err.statusCode = 400;
    throw err;
  }

  return date;
}

function getDateFilters(query) {
  const startDate = parseDateFilter(query.startDate, 'startDate');
  const endDate = parseDateFilter(query.endDate, 'endDate');

  if (startDate && endDate && startDate > endDate) {
    const err = new Error('startDate cannot be after endDate');
    err.statusCode = 400;
    throw err;
  }

  return { startDate, endDate };
}

function appendDateFilters(whereParts, params, tableAlias, query) {
  const { startDate, endDate } = getDateFilters(query);
  const dateColumn = tableAlias ? `${tableAlias}.date` : 'date';

  if (startDate) {
    params.push(startDate);
    whereParts.push(`${dateColumn} >= $${params.length}`);
  }

  if (endDate) {
    params.push(endDate);
    whereParts.push(`${dateColumn} <= $${params.length}`);
  }
}

router.get('/pie', auth, async (req, res) => {
  try {
    const params = [req.user.id];
    const whereParts = ['t.user_id = $1', "t.type = 'debit'"];
    appendDateFilters(whereParts, params, 't', req.query);

    const result = await pool.query(
      `SELECT
        COALESCE(c.name, NULLIF(t.ai_suggested_category, ''), 'Other') as name,
        SUM(ABS(t.amount))::numeric as value
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id AND c.user_id = t.user_id
      WHERE ${whereParts.join(' AND ')}
      GROUP BY 1
      ORDER BY value DESC`,
      params,
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching pie chart data:', err);
    res
      .status(err.statusCode || 500)
      .json({ error: err.statusCode ? err.message : 'Failed to fetch pie chart data' });
  }
});

router.get('/bar', auth, async (req, res) => {
  try {
    const params = [req.user.id];
    const whereParts = ['user_id = $1'];
    appendDateFilters(whereParts, params, '', req.query);

    const result = await pool.query(
      `SELECT
        TO_CHAR(DATE_TRUNC('month', date), 'DD/MM/YYYY') as month,
        SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END)::numeric as income,
        SUM(CASE WHEN type = 'debit' THEN ABS(amount) ELSE 0 END)::numeric as expenses
      FROM transactions
      WHERE ${whereParts.join(' AND ')}
      GROUP BY DATE_TRUNC('month', date)
      ORDER BY DATE_TRUNC('month', date) ASC`,
      params,
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching bar chart data:', err);
    res
      .status(err.statusCode || 500)
      .json({ error: err.statusCode ? err.message : 'Failed to fetch bar chart data' });
  }
});

router.get('/trends', auth, async (req, res) => {
  try {
    const params = [req.user.id];
    const whereParts = ['t.user_id = $1', "t.type = 'debit'"];
    appendDateFilters(whereParts, params, 't', req.query);

    const result = await pool.query(
      `SELECT
        TO_CHAR(DATE_TRUNC('month', date), 'DD/MM/YYYY') as month,
        COALESCE(c.name, 'Other') as category,
        SUM(t.amount) as total
      FROM transactions t
      LEFT JOIN categories c ON t.category_id = c.id AND c.user_id = t.user_id
      WHERE ${whereParts.join(' AND ')}
      GROUP BY DATE_TRUNC('month', date), c.name
      ORDER BY DATE_TRUNC('month', date) DESC, total DESC`,
      params,
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching trends:', err);
    res
      .status(err.statusCode || 500)
      .json({ error: err.statusCode ? err.message : 'Failed to fetch trends' });
  }
});

module.exports = router;
