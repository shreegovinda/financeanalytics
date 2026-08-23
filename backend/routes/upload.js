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
    const allowed = /\.(pdf|xlsx)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and XLSX files are allowed'));
    }
  },
});

function uploadSingleStatement(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    return next();
  });
}

const ALLOWED_BANKS = new Set(['ICICI', 'SBI']);
const ALLOWED_FORMATS = new Set(['PDF', 'XLSX']);

class UploadValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UploadValidationError';
  }
}

function normalizeSelectedBank(value) {
  const bank = String(value || '')
    .trim()
    .toUpperCase();

  if (!ALLOWED_BANKS.has(bank)) {
    throw new UploadValidationError(
      'Please select a valid bank before uploading. Allowed banks are ICICI and SBI.',
    );
  }

  return bank;
}

function normalizeSelectedMonth(value) {
  const statementMonth = String(value || '').trim();

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(statementMonth)) {
    throw new UploadValidationError('Please select a valid statement month before uploading.');
  }

  return statementMonth;
}

function normalizeSelectedFormat(value) {
  const format = String(value || '')
    .trim()
    .toUpperCase();

  if (!ALLOWED_FORMATS.has(format)) {
    throw new UploadValidationError('Please select either PDF or XLSX before uploading.');
  }

  return format;
}

function validateActualFileFormat(file, selectedFormat) {
  const ext = path.extname(file.originalname).toLowerCase();
  const actualFormat = ext === '.pdf' ? 'PDF' : ext === '.xlsx' ? 'XLSX' : null;

  if (!actualFormat || actualFormat !== selectedFormat) {
    throw new UploadValidationError(
      `Selected format is ${selectedFormat}, but the uploaded file is ${actualFormat || 'unsupported'}.`,
    );
  }
}

function detectedBankMatches(detectedBankName, selectedBank) {
  const bankName = String(detectedBankName || '').toUpperCase();

  if (selectedBank === 'ICICI') {
    return bankName.includes('ICICI');
  }

  return bankName.includes('SBI') || bankName.includes('STATE BANK OF INDIA');
}

function toSqlDate(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new UploadValidationError('AI extracted an invalid transaction date.');
  }

  return date.toISOString().slice(0, 10);
}

function getMonthBounds(statementMonth) {
  const [year, month] = statementMonth.split('-').map(Number);
  const start = `${statementMonth}-01`;
  const nextMonth =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

  return { start, nextMonth };
}

function transactionDuplicateKey(transaction) {
  return [
    toSqlDate(transaction.date),
    Number(transaction.amount).toFixed(2),
    String(transaction.type || '').toLowerCase(),
    String(transaction.description || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase(),
  ].join('|');
}

function validateParsedStatement(parsedStatement, selectedBank, selectedMonth) {
  if (!detectedBankMatches(parsedStatement.bankName, selectedBank)) {
    throw new UploadValidationError(
      `Uploaded statement appears to be ${parsedStatement.bankName || 'an unknown bank'}, not ${selectedBank}.`,
    );
  }

  if (parsedStatement.statementMonth && parsedStatement.statementMonth !== selectedMonth) {
    throw new UploadValidationError(
      `Uploaded statement appears to be for ${parsedStatement.statementMonth}, not ${selectedMonth}.`,
    );
  }

  const seen = new Set();
  for (const transaction of parsedStatement.transactions) {
    const transactionMonth = toSqlDate(transaction.date).slice(0, 7);
    if (transactionMonth !== selectedMonth) {
      throw new UploadValidationError(
        `Uploaded statement contains a transaction from ${transactionMonth}, not ${selectedMonth}.`,
      );
    }

    const key = transactionDuplicateKey(transaction);
    if (seen.has(key)) {
      throw new UploadValidationError('Duplicate entries were found in the uploaded statement.');
    }
    seen.add(key);
  }
}

async function ensureMonthNotAlreadyUploaded(client, userId, selectedBank, selectedMonth) {
  const { start, nextMonth } = getMonthBounds(selectedMonth);
  const bankPattern = selectedBank === 'ICICI' ? '%ICICI%' : '%SBI%';
  const bankFullNamePattern = selectedBank === 'SBI' ? '%STATE BANK OF INDIA%' : bankPattern;

  const existing = await client.query(
    `SELECT s.id
     FROM statements s
     WHERE s.user_id = $1
       AND (
         (s.status IN ('processing', 'completed') AND s.statement_month = $2)
         OR EXISTS (
           SELECT 1
           FROM transactions t
           WHERE t.statement_id = s.id
             AND t.date >= $3
             AND t.date < $4
         )
       )
       AND (
         UPPER(s.bank_name) = $5
         OR UPPER(s.bank_name) LIKE $6
         OR UPPER(s.bank_name) LIKE $7
       )
     LIMIT 1`,
    [
      userId,
      `${selectedMonth}-01`,
      start,
      nextMonth,
      selectedBank,
      bankPattern,
      bankFullNamePattern,
    ],
  );

  if (existing.rows.length > 0) {
    throw new UploadValidationError(
      `${selectedBank} transactions for ${selectedMonth} already exist.`,
    );
  }
}

async function ensureNoExistingDuplicateTransactions(client, userId, transactions) {
  if (transactions.length === 0) {
    return;
  }

  const values = [];
  const placeholders = transactions.map((transaction, index) => {
    const offset = index * 4;
    values.push(
      toSqlDate(transaction.date),
      Number(transaction.amount).toFixed(2),
      String(transaction.description || '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase(),
      String(transaction.type || '').toLowerCase(),
    );
    return `($${offset + 2}::date, $${offset + 3}::numeric, $${offset + 4}::text, $${offset + 5}::text)`;
  });

  const duplicateResult = await client.query(
    `WITH incoming(date, amount, description, type) AS (
       VALUES ${placeholders.join(', ')}
     )
     SELECT t.id
     FROM transactions t
     JOIN statements s ON s.id = t.statement_id
     JOIN incoming i
       ON t.date = i.date
      AND t.amount = i.amount
      AND LOWER(TRIM(REGEXP_REPLACE(t.description, '\\s+', ' ', 'g'))) = i.description
      AND LOWER(t.type) = i.type
     WHERE t.user_id = $1
     LIMIT 1`,
    [userId, ...values],
  );

  if (duplicateResult.rows.length > 0) {
    throw new UploadValidationError('Duplicate entries already exist in your transactions.');
  }
}

/**
 * Serialize per-user statement imports.
 *
 * #31 imports a statement inside a single transaction and guards it with
 * ensureMonthNotAlreadyUploaded / ensureNoExistingDuplicateTransactions. Those
 * are check-then-insert, so under READ COMMITTED two concurrent uploads of the
 * same bank+month can both pass before either commits. The advisory lock closes
 * that window; the in-flight check keeps #30's user-facing 409 behaviour so a
 * second upload is rejected while one is still categorizing.
 */
const UPLOAD_LOCK_NAMESPACE = 87421001;

async function lockUserUploads(client, userId) {
  await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2::text))', [
    UPLOAD_LOCK_NAMESPACE,
    String(userId),
  ]);
}

async function getInFlightStatement(userId, queryable = pool) {
  const result = await queryable.query(
    `SELECT id, file_name
     FROM statements
     WHERE user_id = $1 AND status = 'processing'
     ORDER BY uploaded_at DESC
     LIMIT 1`,
    [userId],
  );
  return result.rows[0] || null;
}

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

async function categorizeStatementInBackground({
  statementId,
  originalName,
  transactions,
  txnIds,
  aiProvider,
}) {
  try {
    await updateStatementProgress(statementId, 'categorizing_transactions', 80);

    if (txnIds.length > 0) {
      const results = await categorizeBatch(transactions, aiProvider);
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
      } finally {
        updateClient.release();
      }
    }

    await updateStatementProgress(statementId, 'completed', 100, {
      status: 'completed',
      processedAt: new Date(),
      clearUploadPath: true,
    });

    console.log(`✓ Completed background categorization for ${originalName}`);
  } catch (err) {
    console.error('Background statement categorization failed:', err);
    await markStatementFailed(statementId, err.message).catch((updateErr) => {
      console.error('Failed to record statement processing error:', updateErr);
    });
  }
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
      await client.query(
        'UPDATE statements SET bank_name = $1, processing_stage = $2, processing_progress = $3 WHERE id = $4 AND user_id = $5',
        [bankName, 'importing_transactions', 65, statementId, userId],
      );

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

    await categorizeStatementInBackground({
      statementId,
      originalName,
      transactions,
      txnIds,
      aiProvider,
    });
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

async function loadStatementTransactionsForResume(statementId) {
  const result = await pool.query(
    `SELECT id, to_char(date, 'YYYY-MM-DD') as date, amount, description, type
     FROM transactions
     WHERE statement_id = $1
     ORDER BY date, id`,
    [statementId],
  );

  return {
    txnIds: result.rows.map((row) => row.id),
    transactions: result.rows.map((row) => ({
      date: row.date,
      amount: Number(row.amount),
      description: row.description,
      type: row.type,
    })),
  };
}

async function resumeProcessingStatements() {
  try {
    const result = await pool.query(
      `SELECT id, user_id, file_name, upload_path, ai_provider
       FROM statements
       WHERE status = 'processing'`,
    );

    for (const statement of result.rows) {
      // The current upload flow commits transactions before backgrounding
      // categorization, so an interrupted statement resumes from the database
      // rather than from the uploaded file, which is no longer retained.
      const { txnIds, transactions } = await loadStatementTransactionsForResume(statement.id);

      if (txnIds.length > 0) {
        setImmediate(() => {
          void categorizeStatementInBackground({
            statementId: statement.id,
            originalName: statement.file_name,
            transactions,
            txnIds,
            aiProvider: statement.ai_provider,
          });
        });
        continue;
      }

      // Statements created by the previous flow were parsed in the background
      // from the stored upload, so they still resume from disk when available.
      if (statement.upload_path && fs.existsSync(statement.upload_path)) {
        setImmediate(() => {
          void processStatementInBackground({
            statementId: statement.id,
            filePath: statement.upload_path,
            originalName: statement.file_name,
            userId: statement.user_id,
            aiProvider: statement.ai_provider,
          });
        });
        continue;
      }

      await markStatementFailed(
        statement.id,
        'Processing was interrupted before any transactions were imported. Please upload the statement again.',
      );
    }
  } catch (err) {
    console.error('Failed to resume statement processing:', err);
  }
}

router.post('/', auth, uploadSingleStatement, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const userId = req.user.id;
  const aiProvider = getProviderFromRequest(req);

  try {
    const selectedBank = normalizeSelectedBank(req.body.bank);
    const selectedMonth = normalizeSelectedMonth(req.body.statementMonth);
    const selectedFormat = normalizeSelectedFormat(req.body.fileFormat);
    validateActualFileFormat(req.file, selectedFormat);

    // Reject a concurrent upload before spending a parse and an AI call on it.
    const inFlight = await getInFlightStatement(userId);
    if (inFlight) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return res.status(409).json({
        error: `A statement is already being processed (${inFlight.file_name}). Please wait for it to finish before uploading another.`,
        inFlightStatementId: inFlight.id,
      });
    }

    await ensureMonthNotAlreadyUploaded(pool, userId, selectedBank, selectedMonth);

    const parsedStatement = await parseStatement(filePath, aiProvider, {
      expectedBank: selectedBank,
      expectedMonth: selectedMonth,
      expectedFormat: selectedFormat,
    });
    validateParsedStatement(parsedStatement, selectedBank, selectedMonth);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const transactions = parsedStatement.transactions;
    const txnIds = [];
    const client = await pool.connect();
    let clientReleased = false;
    let statement;

    try {
      await client.query('BEGIN');
      await lockUserUploads(client, userId);
      await ensureMonthNotAlreadyUploaded(client, userId, selectedBank, selectedMonth);
      await ensureNoExistingDuplicateTransactions(client, userId, transactions);

      const statementResult = await client.query(
        `INSERT INTO statements
         (user_id, bank_name, file_name, status, processing_stage, processing_progress,
          upload_path, ai_provider, statement_month, file_format, detected_bank_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id, bank_name, file_name, to_char(uploaded_at, 'YYYY-MM-DD') as uploaded_at, status, processing_stage,
                   processing_progress, statement_month, file_format`,
        [
          userId,
          selectedBank,
          req.file.originalname,
          'processing',
          'importing_transactions',
          65,
          null,
          aiProvider,
          `${selectedMonth}-01`,
          selectedFormat,
          parsedStatement.bankName,
        ],
      );

      statement = statementResult.rows[0];

      const values = [];
      const placeholders = transactions.map((txn, index) => {
        const offset = index * 6;
        values.push(
          userId,
          statement.id,
          toSqlDate(txn.date),
          txn.amount,
          txn.description,
          txn.type,
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
      });

      const transactionResult = await client.query(
        `INSERT INTO transactions (user_id, statement_id, date, amount, description, type)
         VALUES ${placeholders.join(', ')}
         RETURNING id`,
        values,
      );
      txnIds.push(...transactionResult.rows.map((row) => row.id));

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

    setImmediate(() => {
      void categorizeStatementInBackground({
        statementId: statement.id,
        originalName: req.file.originalname,
        transactions,
        txnIds,
        aiProvider,
      });
    });

    res.status(202).json({
      success: true,
      statementId: statement.id,
      statement,
      transactionCount: transactions.length,
      message: `Statement accepted. ${transactions.length} transactions imported and categorization has started.`,
    });
  } catch (err) {
    console.error('Upload failed:', err);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    const status = err instanceof UploadValidationError ? 400 : 500;
    const prefix = err instanceof UploadValidationError ? '' : 'Failed to upload statement: ';
    res.status(status).json({ error: `${prefix}${err.message}` });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, bank_name, file_name, to_char(uploaded_at, 'YYYY-MM-DD') as uploaded_at, status, processing_stage,
              processing_progress, processing_error, to_char(processed_at, 'YYYY-MM-DD') as processed_at, statement_month,
              file_format, detected_bank_name
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
    const statement = await pool.query(
      `SELECT id, user_id, bank_name, file_name, to_char(uploaded_at, 'YYYY-MM-DD') as uploaded_at, status,
              processing_stage, processing_progress, processing_error, to_char(processed_at, 'YYYY-MM-DD') as processed_at,
              statement_month, file_format, detected_bank_name, upload_path, ai_provider, to_char(created_at, 'YYYY-MM-DD') as created_at
       FROM statements WHERE id = $1 AND user_id = $2`,
      [req.params.statementId, req.user.id],
    );

    if (statement.rows.length === 0) {
      return res.status(404).json({ error: 'Statement not found' });
    }

    const transactions = await pool.query(
      "SELECT id, user_id, statement_id, to_char(date, 'YYYY-MM-DD') as date, amount, description, category_id, ai_suggested_category, type, to_char(created_at, 'YYYY-MM-DD') as created_at FROM transactions WHERE statement_id = $1 ORDER BY date",
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

router.delete('/:statementId', auth, async (req, res) => {
  try {
    // First verify the statement belongs to this user
    const statement = await pool.query(
      'SELECT id, file_name FROM statements WHERE id = $1 AND user_id = $2',
      [req.params.statementId, req.user.id],
    );

    if (statement.rows.length === 0) {
      return res.status(404).json({ error: 'Statement not found' });
    }

    // Delete the statement - cascades to transactions automatically due to foreign key constraints
    await pool.query('DELETE FROM statements WHERE id = $1', [req.params.statementId]);

    res.json({
      success: true,
      message: `Statement "${statement.rows[0].file_name}" has been deleted along with its transactions`,
    });
  } catch (err) {
    console.error('Error deleting statement:', err);
    res.status(500).json({ error: 'Failed to delete statement' });
  }
});

router.resumeProcessingStatements = resumeProcessingStatements;
router.getInFlightStatement = getInFlightStatement;
router.lockUserUploads = lockUserUploads;

module.exports = router;
