const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { parseBill } = require('../services/parsers/bill');
const { getProviderFromRequest } = require('../services/ai');

/**
 * Merchant bills attached to a single transaction.
 *
 * A bill is detail about money already accounted for by the bank statement, not
 * new spending, so nothing here creates a transaction. Line items are attached
 * to an existing one, which is what keeps totals from double-counting.
 *
 * Mounted with mergeParams so :transactionId from the parent path is visible.
 */
const router = express.Router({ mergeParams: true });

class BillValidationError extends Error {}

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Same limits and storage scheme as statement upload.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `bill-${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.(pdf|xlsx|xls)$/i.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new BillValidationError('Only PDF and Excel bills are supported.'));
    }
  },
});

function uploadSingleBill(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    const status = err instanceof BillValidationError ? 400 : 400;
    return res.status(status).json({ error: err.message });
  });
}

/**
 * Loads a transaction, scoped to the caller. Returning null for another user's
 * id means the API cannot be used to probe for transactions that exist.
 */
async function loadOwnedTransaction(queryable, transactionId, userId) {
  const result = await queryable.query(
    `SELECT id, amount, type, to_char(date, 'YYYY-MM-DD') AS date, description
     FROM transactions
     WHERE id = $1 AND user_id = $2`,
    [transactionId, userId],
  );
  return result.rows[0] || null;
}

/**
 * A bill total that disagrees with the transaction is worth surfacing, but not
 * worth blocking: tips, partial refunds, wallet top-ups, and separately charged
 * delivery all produce legitimate mismatches.
 */
function buildMismatch(transaction, billTotal) {
  if (billTotal === null || billTotal === undefined) {
    return {
      mismatch: true,
      reason: 'no_total',
      message: 'No total could be read from this bill.',
    };
  }

  const txnAmount = Math.abs(Number(transaction.amount));
  const difference = Number((billTotal - txnAmount).toFixed(2));

  if (Math.abs(difference) < 0.01) {
    return { mismatch: false, difference: 0 };
  }

  return {
    mismatch: true,
    reason: 'total_differs',
    difference,
    message: `Bill total ₹${billTotal.toFixed(2)} does not match the transaction amount ₹${txnAmount.toFixed(2)}.`,
  };
}

function serializeBill(row, lineItems) {
  return {
    id: row.id,
    transactionId: row.transaction_id,
    fileName: row.file_name,
    merchantName: row.merchant_name,
    billTotal: row.bill_total === null ? null : Number(row.bill_total),
    billDate: row.bill_date,
    status: row.status,
    createdAt: row.created_at,
    lineItems: lineItems ?? row.payload?.lineItems ?? [],
  };
}

/**
 * Upload and parse a bill. Held as pending_review; nothing is attached until
 * the preview is confirmed.
 */
router.post('/', auth, uploadSingleBill, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const userId = req.user.id;

  try {
    const transaction = await loadOwnedTransaction(pool, req.params.transactionId, userId);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const parsed = await parseBill(filePath, getProviderFromRequest(req));

    const result = await pool.query(
      `INSERT INTO transaction_bills
         (transaction_id, user_id, file_name, merchant_name, bill_total, bill_date, status, payload)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending_review', $7)
       RETURNING id, transaction_id, file_name, merchant_name, bill_total,
                 to_char(bill_date, 'YYYY-MM-DD') AS bill_date, status,
                 to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at, payload`,
      [
        transaction.id,
        userId,
        req.file.originalname,
        parsed.merchantName,
        parsed.total,
        parsed.billDate,
        JSON.stringify(parsed),
      ],
    );

    res.status(202).json({
      success: true,
      requiresReview: true,
      bill: serializeBill(result.rows[0], parsed.lineItems),
      transaction,
      ...buildMismatch(transaction, parsed.total),
    });
  } catch (err) {
    console.error('Bill upload failed:', err);
    const status = err instanceof BillValidationError ? 400 : 500;
    const prefix = err instanceof BillValidationError ? '' : 'Failed to process bill: ';
    res.status(status).json({ error: `${prefix}${err.message}` });
  } finally {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

/**
 * Commit a reviewed bill: write its line items and flag the transaction.
 */
router.post('/:billId/confirm', auth, async (req, res) => {
  const userId = req.user.id;
  const client = await pool.connect();
  let clientReleased = false;

  try {
    await client.query('BEGIN');

    const billResult = await client.query(
      `SELECT id, transaction_id, payload
       FROM transaction_bills
       WHERE id = $1 AND user_id = $2 AND transaction_id = $3 AND status = 'pending_review'
       FOR UPDATE`,
      [req.params.billId, userId, req.params.transactionId],
    );

    if (billResult.rows.length === 0) {
      await client.query('ROLLBACK');
      client.release();
      clientReleased = true;
      return res.status(404).json({ error: 'No pending bill found for this transaction.' });
    }

    const bill = billResult.rows[0];
    const lineItems = Array.isArray(bill.payload?.lineItems) ? bill.payload.lineItems : [];

    if (lineItems.length > 0) {
      const values = [];
      const placeholders = lineItems.map((item, index) => {
        const offset = index * 6;
        values.push(
          bill.id,
          bill.transaction_id,
          item.description,
          item.quantity,
          item.unitPrice,
          item.amount,
        );
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
      });

      await client.query(
        `INSERT INTO transaction_line_items
           (transaction_bill_id, transaction_id, description, quantity, unit_price, amount)
         VALUES ${placeholders.join(', ')}`,
        values,
      );
    }

    await client.query(
      `UPDATE transaction_bills SET status = 'confirmed', confirmed_at = NOW() WHERE id = $1`,
      [bill.id],
    );
    await client.query('UPDATE transactions SET has_bill = TRUE WHERE id = $1 AND user_id = $2', [
      bill.transaction_id,
      userId,
    ]);

    await client.query('COMMIT');
    client.release();
    clientReleased = true;

    res.json({
      success: true,
      billId: bill.id,
      lineItemCount: lineItems.length,
      message: `Bill attached with ${lineItems.length} line items.`,
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback error while confirming bill:', rollbackErr);
    }
    console.error('Error confirming bill:', err);
    res.status(500).json({ error: 'Failed to attach bill' });
  } finally {
    if (!clientReleased) {
      client.release();
    }
  }
});

router.post('/:billId/discard', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM transaction_bills
       WHERE id = $1 AND user_id = $2 AND transaction_id = $3 AND status = 'pending_review'
       RETURNING id`,
      [req.params.billId, req.user.id, req.params.transactionId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No pending bill found for this transaction.' });
    }

    res.json({ success: true, message: 'Bill discarded.' });
  } catch (err) {
    console.error('Error discarding bill:', err);
    res.status(500).json({ error: 'Failed to discard bill' });
  }
});

/**
 * Bills attached to a transaction, with their line items.
 */
router.get('/', auth, async (req, res) => {
  try {
    const transaction = await loadOwnedTransaction(pool, req.params.transactionId, req.user.id);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const bills = await pool.query(
      `SELECT id, transaction_id, file_name, merchant_name, bill_total,
              to_char(bill_date, 'YYYY-MM-DD') AS bill_date, status,
              to_char(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS created_at, payload
       FROM transaction_bills
       WHERE transaction_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [transaction.id, req.user.id],
    );

    const items = await pool.query(
      `SELECT transaction_bill_id, description, quantity, unit_price, amount
       FROM transaction_line_items
       WHERE transaction_id = $1
       ORDER BY created_at`,
      [transaction.id],
    );

    const itemsByBill = new Map();
    for (const item of items.rows) {
      const list = itemsByBill.get(item.transaction_bill_id) || [];
      list.push({
        description: item.description,
        quantity: item.quantity === null ? null : Number(item.quantity),
        unitPrice: item.unit_price === null ? null : Number(item.unit_price),
        amount: Number(item.amount),
      });
      itemsByBill.set(item.transaction_bill_id, list);
    }

    res.json({
      transaction,
      bills: bills.rows.map((row) => serializeBill(row, itemsByBill.get(row.id))),
    });
  } catch (err) {
    console.error('Error fetching bills:', err);
    res.status(500).json({ error: 'Failed to fetch bills' });
  }
});

module.exports = router;
module.exports.buildMismatch = buildMismatch;
