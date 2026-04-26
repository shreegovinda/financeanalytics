const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { categorizeBatch } = require('../services/claude');
const { getProviderFromRequest } = require('../services/ai');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate, categoryId, limit = 100, offset = 0 } = req.query;
    let query = 'SELECT * FROM transactions WHERE user_id = $1';
    const params = [req.user.id];
    let paramIndex = 2;

    if (startDate) {
      query += ` AND date >= $${paramIndex}`;
      params.push(new Date(startDate));
      paramIndex++;
    }

    if (endDate) {
      query += ` AND date <= $${paramIndex}`;
      params.push(new Date(endDate));
      paramIndex++;
    }

    if (categoryId) {
      query += ` AND category_id = $${paramIndex}`;
      params.push(categoryId);
      paramIndex++;
    }

    query += ` ORDER BY date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM transactions WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching transaction:', err);
    res.status(500).json({ error: 'Failed to fetch transaction' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { categoryId, description } = req.body;

    const txn = await pool.query('SELECT * FROM transactions WHERE id = $1 AND user_id = $2', [
      req.params.id,
      req.user.id,
    ]);

    if (txn.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    let updateQuery = 'UPDATE transactions SET ';
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (categoryId !== undefined) {
      if (categoryId !== null && categoryId !== '') {
        const catCheck = await pool.query(
          'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
          [categoryId, req.user.id],
        );
        if (catCheck.rows.length === 0) {
          return res.status(404).json({ error: 'Category not found' });
        }
      }
      updates.push(`category_id = $${paramIndex}`);
      params.push(categoryId || null);
      paramIndex++;
    }

    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateQuery += updates.join(', ') + ` WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING *`;
    params.push(req.params.id, req.user.id);

    const result = await pool.query(updateQuery, params);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating transaction:', err);
    res.status(500).json({ error: 'Failed to update transaction' });
  }
});

router.get('/stats/summary', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END)::numeric as total_income,
        SUM(CASE WHEN type = 'debit' THEN ABS(amount) ELSE 0 END)::numeric as total_expenses,
        COUNT(*) as transaction_count
      FROM transactions WHERE user_id = $1`,
      [req.user.id],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.post('/categorize', auth, async (req, res) => {
  try {
    const { transactionIds } = req.body;

    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({ error: 'Transaction IDs array required' });
    }

    const result = await pool.query(
      'SELECT id, date, amount, description, type FROM transactions WHERE user_id = $1 AND id = ANY($2)',
      [req.user.id, transactionIds],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No transactions found' });
    }

    const txns = result.rows.map((row) => ({
      date: row.date,
      description: row.description,
      amount: row.amount,
      type: row.type,
    }));

    const categorizations = await categorizeBatch(txns, getProviderFromRequest(req));

    const updatePromises = categorizations.map((cat) => {
      const txnIndex = cat.transactionIndex;
      if (txnIndex < result.rows.length) {
        return pool.query('UPDATE transactions SET ai_suggested_category = $1 WHERE id = $2', [
          cat.category,
          result.rows[txnIndex].id,
        ]);
      }
    });

    await Promise.all(updatePromises);

    res.json({
      success: true,
      categorized: categorizations.length,
      message: `${categorizations.length} transactions categorized`,
    });
  } catch (err) {
    console.error('Error categorizing transactions:', err);
    res.status(500).json({ error: `Failed to categorize transactions: ${err.message}` });
  }
});

module.exports = router;
