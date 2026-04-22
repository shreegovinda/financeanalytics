const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');

const router = express.Router();

const DEFAULT_CATEGORIES = [
  { name: 'Income', color: '#10b981' },
  { name: 'Rent', color: '#f59e0b' },
  { name: 'Utilities', color: '#3b82f6' },
  { name: 'Food', color: '#ef4444' },
  { name: 'Transport', color: '#6366f1' },
  { name: 'Entertainment', color: '#ec4899' },
  { name: 'Shopping', color: '#8b5cf6' },
  { name: 'Investment', color: '#14b8a6' },
  { name: 'Salary', color: '#06b6d4' },
  { name: 'Other', color: '#6b7280' },
];

router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, color, is_default FROM categories WHERE user_id = $1 ORDER BY name',
      [req.user.id],
    );

    if (result.rows.length === 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const cat of DEFAULT_CATEGORIES) {
          await client.query(
            'INSERT INTO categories (user_id, name, color, is_default) VALUES ($1, $2, $3, $4)',
            [req.user.id, cat.name, cat.color, true],
          );
        }

        await client.query('COMMIT');
        const newResult = await pool.query(
          'SELECT id, name, color, is_default FROM categories WHERE user_id = $1 ORDER BY name',
          [req.user.id],
        );
        return res.json(newResult.rows);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { name, color } = req.body;

    if (!name || !color) {
      return res.status(400).json({ error: 'Name and color are required' });
    }

    const result = await pool.query(
      'INSERT INTO categories (user_id, name, color, is_default) VALUES ($1, $2, $3, FALSE) RETURNING id, name, color, is_default',
      [req.user.id, name, color],
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating category:', err);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { name, color } = req.body;
    const categoryId = req.params.id;

    const cat = await pool.query('SELECT is_default FROM categories WHERE id = $1 AND user_id = $2', [
      categoryId,
      req.user.id,
    ]);

    if (cat.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    if (cat.rows[0].is_default) {
      return res.status(400).json({ error: 'Cannot modify default categories' });
    }

    let updateQuery = 'UPDATE categories SET ';
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex}`);
      params.push(name);
      paramIndex++;
    }

    if (color !== undefined) {
      updates.push(`color = $${paramIndex}`);
      params.push(color);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateQuery += updates.join(', ') + ` WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1} RETURNING id, name, color, is_default`;
    params.push(categoryId, req.user.id);

    const result = await pool.query(updateQuery, params);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating category:', err);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

router.post('/bulk-reassign', auth, async (req, res) => {
  try {
    const { transactionIds, categoryId } = req.body;

    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return res.status(400).json({ error: 'Transaction IDs array required' });
    }

    if (!categoryId) {
      return res.status(400).json({ error: 'Category ID required' });
    }

    // Verify category exists and belongs to user
    const catCheck = await pool.query(
      'SELECT id FROM categories WHERE id = $1 AND user_id = $2',
      [categoryId, req.user.id],
    );

    if (catCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Update transactions
    const result = await pool.query(
      'UPDATE transactions SET category_id = $1 WHERE user_id = $2 AND id = ANY($3) RETURNING id',
      [categoryId, req.user.id, transactionIds],
    );

    res.json({ success: true, updated: result.rows.length });
  } catch (err) {
    console.error('Error reassigning transactions:', err);
    res.status(500).json({ error: 'Failed to reassign transactions' });
  }
});

module.exports = router;
