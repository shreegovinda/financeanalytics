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

async function acquireStatementLock(statementId) {
  const lockClient = await pool.connect();
  let lockAcquired = false;

  try {
    const result = await lockClient.query(
      'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
      [statementId],
    );
    lockAcquired = Boolean(result.rows[0]?.acquired);

    if (!lockAcquired) {
      lockClient.release();
      return null;
    }

    return lockClient;
  } catch (err) {
    if (!lockAcquired) {
      lockClient.release();
    }
    throw err;
  }
}

async function releaseStatementLock(lockClient, statementId) {
  if (!lockClient) {
    return;
  }

  try {
    await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [statementId]);
  } finally {
    lockClient.release();
  }
}

async function backfillLegacyTransactionRowIndexes(client, statementId, expectedCount) {
  const existing = await client.query(
    `SELECT id, statement_row_index
     FROM transactions
     WHERE statement_id = $1
     FOR UPDATE`,
    [statementId],
  );

  if (existing.rows.length === 0) {
    return;
  }

  const indexedRows = existing.rows.filter((row) => row.statement_row_index !== null);
  const legacyRows = existing.rows.filter((row) => row.statement_row_index === null);

  if (legacyRows.length === 0) {
    return;
  }

  if (indexedRows.length > 0 || legacyRows.length !== expectedCount) {
    throw new Error('Statement already has transactions and cannot be safely resumed');
  }

  const orderedLegacyRows = await client.query(
    `SELECT id
     FROM transactions
     WHERE statement_id = $1 AND statement_row_index IS NULL
     ORDER BY ctid
     FOR UPDATE`,
    [statementId],
  );

  for (let index = 0; index < orderedLegacyRows.rows.length; index++) {
    await client.query('UPDATE transactions SET statement_row_index = $1 WHERE id = $2', [
      index,
      orderedLegacyRows.rows[index].id,
    ]);
  }
}

async function importTransactionsForStatement(client, { statementId, userId, transactions }) {
  if (transactions.length === 0) {
    return [];
  }

  await backfillLegacyTransactionRowIndexes(client, statementId, transactions.length);

  const values = [];
  const placeholders = transactions.map((txn, index) => {
    const offset = index * 7;
    values.push(userId, statementId, index, txn.date, txn.amount, txn.description, txn.type);
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
  });

  const result = await client.query(
    `INSERT INTO transactions
       (user_id, statement_id, statement_row_index, date, amount, description, type)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (statement_id, statement_row_index)
     DO UPDATE SET
       date = EXCLUDED.date,
       amount = EXCLUDED.amount,
       description = EXCLUDED.description,
       type = EXCLUDED.type
     RETURNING id, statement_row_index`,
    values,
  );

  const txnIds = [];
  for (const row of result.rows) {
    txnIds[row.statement_row_index] = row.id;
  }

  return txnIds;
}

async function processStatementInBackground({
  statementId,
  filePath,
  originalName,
  userId,
  aiProvider,
}) {
  let lockClient = null;
  let importCommitted = false;

  try {
    lockClient = await acquireStatementLock(statementId);
    if (!lockClient) {
      console.warn(`Statement ${statementId} is already being processed by another worker`);
      return;
    }

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
      await client.query(
        'UPDATE statements SET bank_name = $1, processing_stage = $2, processing_progress = $3 WHERE id = $4 AND user_id = $5',
        [bankName, 'importing_transactions', 65, statementId, userId],
      );

      const importedTxnIds = await importTransactionsForStatement(client, {
        statementId,
        userId,
        transactions,
      });
      txnIds.push(...importedTxnIds);

      await client.query('COMMIT');
      importCommitted = txnIds.length > 0;
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
      try {
        const results = await categorizeBatch(transactions, aiProvider);
        const updateClient = await pool.connect();
        try {
          for (const result of results) {
            if (result.transactionIndex >= 0 && result.transactionIndex < txnIds.length) {
              await updateClient.query(
                'UPDATE transactions SET ai_suggested_category = $1 WHERE id = $2',
                [result.category, txnIds[result.transactionIndex]],
              );
            }
          }
        } finally {
          updateClient.release();
        }
      } catch (categorizeErr) {
        console.error('AI categorization failed after import:', categorizeErr);
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
    if (importCommitted) {
      await updateStatementProgress(statementId, 'completed', 100, {
        status: 'completed',
        processedAt: new Date(),
        clearUploadPath: true,
      }).catch((updateErr) => {
        console.error('Failed to mark imported statement completed:', updateErr);
      });
    } else {
      await markStatementFailed(statementId, err.message).catch((updateErr) => {
        console.error('Failed to record statement processing error:', updateErr);
      });
    }
  } finally {
    await releaseStatementLock(lockClient, statementId).catch((unlockErr) => {
      console.error('Failed to release statement processing lock:', unlockErr);
    });

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

async function completeImportedStatement(statementId) {
  await updateStatementProgress(statementId, 'completed', 100, {
    status: 'completed',
    processedAt: new Date(),
    clearUploadPath: true,
  });
}

async function hasImportedTransactions(statementId) {
  const result = await pool.query('SELECT 1 FROM transactions WHERE statement_id = $1 LIMIT 1', [
    statementId,
  ]);
  return result.rows.length > 0;
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
        if (await hasImportedTransactions(statement.id)) {
          await completeImportedStatement(statement.id);
          continue;
        }

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
router.processStatementInBackground = processStatementInBackground;
router.importTransactionsForStatement = importTransactionsForStatement;

module.exports = router;
