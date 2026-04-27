const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { parseStatement } = require('../services/parsers/generic');
const { categorizeBatch } = require('../services/claude');
const { getProviderFromRequest } = require('../services/ai');

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
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(pdf|xlsx|xls)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and Excel files are allowed'));
    }
  },
});

async function updateStatementProgress(statementId, stage, progress, extra = {}) {
  await pool.query(
    `UPDATE statements
     SET processing_stage = $1,
         processing_progress = $2,
         status = COALESCE($3, status),
         processing_error = COALESCE($4, processing_error),
         processed_at = COALESCE($5, processed_at),
         upload_path = CASE
           WHEN $6 THEN NULL
           WHEN $7 IS NOT NULL THEN $7
           ELSE upload_path
         END
     WHERE id = $8`,
    [
      stage,
      progress,
      extra.status || null,
      extra.error || null,
      extra.processedAt || null,
      Boolean(extra.clearUploadPath),
      extra.uploadPath || null,
      statementId,
    ],
  );
}

async function markStatementFailed(statementId, message) {
  await updateStatementProgress(statementId, 'failed', 100, {
    status: 'failed',
    error: message,
    processedAt: new Date(),
    clearUploadPath: true,
  });
}

async function processStatementInBackground({
  statementId,
  filePath,
  originalName,
  userId,
  aiProvider,
}) {
  try {
    await updateStatementProgress(statementId, 'extracting_text', 20);

    const parsedStatement = await parseStatement(filePath, aiProvider);
    const bankName = (parsedStatement.bankName || 'Unknown Bank').slice(0, 50).toUpperCase();
    const transactions = parsedStatement.transactions;

    await updateStatementProgress(statementId, 'importing_transactions', 55);

    const client = await pool.connect();
    let clientReleased = false;
    const txnIds = [];

    try {
      await client.query('BEGIN');
      const statementLock = await client.query(
        'SELECT status FROM statements WHERE id = $1 AND user_id = $2 FOR UPDATE',
        [statementId, userId],
      );

      if (statementLock.rows.length === 0) {
        throw new Error('Statement not found');
      }

      if (statementLock.rows[0].status !== 'processing') {
        await client.query('COMMIT');
        client.release();
        clientReleased = true;
        return;
      }

      await client.query(
        'UPDATE statements SET bank_name = $1, processing_stage = $2, processing_progress = $3 WHERE id = $4 AND user_id = $5',
        [bankName, 'importing_transactions', 65, statementId, userId],
      );

      await client.query('DELETE FROM transactions WHERE statement_id = $1 AND user_id = $2', [
        statementId,
        userId,
      ]);

      if (transactions.length > 0) {
        const values = [];
        const placeholders = transactions.map((txn, index) => {
          const offset = index * 6;
          values.push(userId, statementId, txn.date, txn.amount, txn.description, txn.type);
          return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
        });

        const result = await client.query(
          `INSERT INTO transactions (user_id, statement_id, date, amount, description, type)
           VALUES ${placeholders.join(', ')}
           RETURNING id`,
          values,
        );
        txnIds.push(...result.rows.map((row) => row.id));
      }

      await client.query('COMMIT');
      client.release();
      clientReleased = true;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('Rollback error:', rollbackErr);
      }
      throw err;
    } finally {
      if (!clientReleased) {
        client.release();
      }
    }

    await updateStatementProgress(statementId, 'categorizing_transactions', 80);

    if (txnIds.length > 0) {
      const results = await categorizeBatch(transactions, aiProvider);
      const updateClient = await pool.connect();
      try {
        for (const result of results) {
          if (
            Number.isInteger(result.transactionIndex) &&
            result.transactionIndex >= 0 &&
            result.transactionIndex < txnIds.length
          ) {
            await updateClient.query(
              'UPDATE transactions SET ai_suggested_category = $1 WHERE id = $2',
              [result.category, txnIds[result.transactionIndex]],
            );
          }
        }
      } finally {
        updateClient.release();
      }
    }

    await updateStatementProgress(statementId, 'completed', 100, {
      status: 'completed',
      processedAt: new Date(),
      clearUploadPath: true,
    });

    console.log(`✓ Completed background processing for ${originalName}`);
  } catch (err) {
    console.error('Background statement processing failed:', err);
    await markStatementFailed(statementId, err.message).catch((updateErr) => {
      console.error('Failed to record statement processing error:', updateErr);
    });
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

async function resumeProcessingStatements() {
  try {
    const result = await pool.query(
      `SELECT id, user_id, file_name, upload_path, ai_provider
       FROM statements
       WHERE status = 'processing'`,
    );

    for (const statement of result.rows) {
      if (!statement.upload_path || !fs.existsSync(statement.upload_path)) {
        await markStatementFailed(
          statement.id,
          'Processing was interrupted and the uploaded file is no longer available. Please upload the statement again.',
        );
        continue;
      }

      setImmediate(() => {
        void processStatementInBackground({
          statementId: statement.id,
          filePath: statement.upload_path,
          originalName: statement.file_name,
          userId: statement.user_id,
          aiProvider: statement.ai_provider,
        });
      });
    }
  } catch (err) {
    console.error('Failed to resume statement processing:', err);
  }
}

router.post('/', auth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const userId = req.user.id;
  const aiProvider = getProviderFromRequest(req);

  try {
    const statementResult = await pool.query(
      `INSERT INTO statements
       (user_id, bank_name, file_name, status, processing_stage, processing_progress, upload_path, ai_provider)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, bank_name, file_name, uploaded_at, status, processing_stage, processing_progress`,
      [
        userId,
        'DETECTING BANK',
        req.file.originalname,
        'processing',
        'uploaded',
        5,
        filePath,
        aiProvider,
      ],
    );

    const statement = statementResult.rows[0];

    setImmediate(() => {
      void processStatementInBackground({
        statementId: statement.id,
        filePath,
        originalName: req.file.originalname,
        userId,
        aiProvider,
      });
    });

    res.status(202).json({
      success: true,
      statementId: statement.id,
      statement,
      transactionCount: 0,
      message: 'Statement uploaded. Processing has started in the background.',
    });
  } catch (err) {
    console.error('Upload failed:', err);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.status(500).json({ error: `Failed to upload statement: ${err.message}` });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, bank_name, file_name, uploaded_at, status, processing_stage,
              processing_progress, processing_error, processed_at
       FROM statements
       WHERE user_id = $1
       ORDER BY uploaded_at DESC`,
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
    const statement = await pool.query('SELECT * FROM statements WHERE id = $1 AND user_id = $2', [
      req.params.statementId,
      req.user.id,
    ]);

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

router.resumeProcessingStatements = resumeProcessingStatements;

module.exports = router;
