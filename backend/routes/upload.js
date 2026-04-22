const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { parseStatement } = require('../services/parsers/generic');
const { categorizeBatch } = require('../services/claude');

const router = express.Router();

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = /\.(pdf|xlsx|xls)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Excel files are allowed'));
    }
  },
});

router.post('/', auth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const { bankName } = req.body;
  if (!bankName || bankName.trim().length === 0) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'Bank name is required' });
  }

  const filePath = req.file.path;
  const userId = req.user.id;
  const bankNameNormalized = bankName.trim().toUpperCase();
  let statementId = null;

  try {
    const client = await pool.connect();

    const statementResult = await client.query(
      'INSERT INTO statements (user_id, bank_name, file_name, status) VALUES ($1, $2, $3, $4) RETURNING id',
      [userId, bankNameNormalized, req.file.originalname, 'processing'],
    );

    statementId = statementResult.rows[0].id;

    client.release();

    // Use generic parser for any bank statement format
    let transactions = [];
    try {
      transactions = await parseStatement(filePath);
    } catch (parseErr) {
      console.error('Parse error:', parseErr);
      throw new Error(`Failed to parse statement: ${parseErr.message}`);
    }

    const client2 = await pool.connect();
    let client2Released = false;

    try {
      await client2.query('BEGIN');

      const txnIds = [];
      for (const txn of transactions) {
        if (txn.date && txn.amount) {
          const result = await client2.query(
            'INSERT INTO transactions (user_id, statement_id, date, amount, description, type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [userId, statementId, txn.date, txn.amount, txn.description, txn.type],
          );
          txnIds.push(result.rows[0].id);
        }
      }

      await client2.query('UPDATE statements SET status = $1 WHERE id = $2', ['completed', statementId]);
      await client2.query('COMMIT');

      client2.release();
      client2Released = true;

      // Queue transactions for async categorization (don't block response)
      if (txnIds.length > 0) {
        categorizeBatch(transactions)
          .then(async (results) => {
            const updateClient = await pool.connect();
            try {
              for (const result of results) {
                if (result.transactionIndex < txnIds.length) {
                  await updateClient.query(
                    'UPDATE transactions SET ai_suggested_category = $1 WHERE id = $2',
                    [result.category, txnIds[result.transactionIndex]],
                  );
                }
              }
            } catch (err) {
              console.error('Error updating categorizations:', err);
            } finally {
              updateClient.release();
            }
          })
          .catch((err) => {
            console.error('Batch categorization failed:', err);
          });
      }
    } catch (err) {
      try {
        await client2.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Rollback error:', rollbackErr);
      }
      throw err;
    } finally {
      if (!client2Released) {
        client2.release();
      }
    }

    fs.unlinkSync(filePath);

    res.json({
      success: true,
      statementId,
      transactionCount: transactions.length,
      message: `${transactions.length} transactions imported from ${bankName}`,
    });
  } catch (err) {
    console.error('Upload processing failed:', err);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Update statement status to failed if we have a statementId
    if (statementId) {
      try {
        await pool.query('UPDATE statements SET status = $1 WHERE id = $2', ['failed', statementId]);
      } catch (_) {
        // Ignore error in cleanup
      }
    }

    res.status(500).json({ error: `Failed to process statement: ${err.message}` });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, bank_name, file_name, uploaded_at, status FROM statements WHERE user_id = $1 ORDER BY uploaded_at DESC',
      [req.user.id],
    );

    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching statements:', err);
    res.status(500).json({ error: 'Failed to fetch statements' });
  }
});

router.get('/:statementId', auth, async (req, res) => {
  try {
    const statement = await pool.query(
      'SELECT * FROM statements WHERE id = $1 AND user_id = $2',
      [req.params.statementId, req.user.id],
    );

    if (statement.rows.length === 0) {
      return res.status(404).json({ error: 'Statement not found' });
    }

    const transactions = await pool.query(
      'SELECT * FROM transactions WHERE statement_id = $1 ORDER BY date',
      [req.params.statementId],
    );

    res.json({
      statement: statement.rows[0],
      transactions: transactions.rows,
    });
  } catch (err) {
    console.error('Error fetching statement details:', err);
    res.status(500).json({ error: 'Failed to fetch statement details' });
  }
});

module.exports = router;
