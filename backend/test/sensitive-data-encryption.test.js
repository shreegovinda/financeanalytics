const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../config/db');
const {
  encrypt,
  decrypt,
  safeDecrypt,
  isEncrypted,
  encryptJson,
  decryptJson,
  computeBlindIndex,
} = require('../services/crypto');
const { normalizePhoneNumber } = require('../services/whatsappService');
const chatHistory = require('../services/chatHistory');
const { getUserDataExport } = require('../services/exportService');

describe('Sensitive Data Encryption At Rest & Blind Indexing Suite', () => {
  let testUserId;
  let testStatementId;
  let testTransactionId;
  let testBillId;

  const rawUserName = 'Priya Sharma';
  const rawUserPhone = '+919876543210';
  const rawTxnDescription = 'Amazon India Electronics Order #98124';
  const rawChatMessage = 'How much did I spend on electronics this month?';
  const rawChatAnswer = 'You spent ₹14,999.00 on electronics.';
  const rawMerchantName = 'Amazon India Retail Ltd';
  const rawLineItem = 'Sony WH-1000XM5 Headphones';
  let dbAvailable = true;

  before(async () => {
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      if (
        (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) &&
        !process.env.CI
      ) {
        console.warn('⚠️ Skipping real DB tests: PostgreSQL is not available.');
        dbAvailable = false;
        return;
      }
      throw err;
    }

    // 1. Create a user with application-level encryption
    const normalizedPhone = normalizePhoneNumber(rawUserPhone);
    const phoneHash = computeBlindIndex(normalizedPhone);
    const encName = encrypt(rawUserName);
    const encPhone = encrypt(rawUserPhone);

    const userRes = await pool.query(
      `INSERT INTO users (email, name, phone, phone_hash, password_hash, email_verified)
       VALUES ($1, $2, $3, $4, 'dummy_hash', true)
       RETURNING id`,
      [`enc-test-${Date.now()}@example.com`, encName, encPhone, phoneHash],
    );
    testUserId = userRes.rows[0].id;

    // 2. Create a statement
    const stmtRes = await pool.query(
      `INSERT INTO statements (user_id, bank_name, statement_month, status, file_name)
       VALUES ($1, 'HDFC', '2026-01-01', 'pending_review', 'hdfc_statement_2026_01.pdf')
       RETURNING id`,
      [testUserId],
    );
    testStatementId = stmtRes.rows[0].id;

    // 3. Create a statement draft with encrypted payload
    const draftPayload = {
      bankName: 'HDFC',
      statementMonth: '2026-01',
      transactions: [
        { date: '2026-01-15', amount: 14999, description: rawTxnDescription, type: 'debit' },
      ],
    };
    await pool.query(
      `INSERT INTO statement_drafts (statement_id, payload, transaction_count, total_debit, total_credit)
       VALUES ($1, $2, 1, 14999, 0)`,
      [testStatementId, JSON.stringify({ encrypted: encryptJson(draftPayload) })],
    );

    // 4. Create an encrypted transaction
    const txnRes = await pool.query(
      `INSERT INTO transactions (user_id, statement_id, date, amount, description, type)
       VALUES ($1, $2, '2026-01-15', 14999, $3, 'debit')
       RETURNING id`,
      [testUserId, testStatementId, encrypt(rawTxnDescription)],
    );
    testTransactionId = txnRes.rows[0].id;

    // 5. Create an encrypted chat exchange
    await chatHistory.save(pool, testUserId, 0, rawChatMessage, {
      answer: rawChatAnswer,
      sources: [],
    });

    // 6. Create an encrypted bill and line item
    const billRes = await pool.query(
      `INSERT INTO transaction_bills (transaction_id, user_id, file_name, merchant_name, bill_total, bill_date, status, payload)
       VALUES ($1, $2, $3, $4, 14999, '2026-01-15', 'confirmed', $5)
       RETURNING id`,
      [
        testTransactionId,
        testUserId,
        encrypt('invoice-amazon-98124.pdf'),
        encrypt(rawMerchantName),
        JSON.stringify({ encrypted: encryptJson({ merchantName: rawMerchantName, total: 14999 }) }),
      ],
    );
    testBillId = billRes.rows[0].id;

    await pool.query(
      `INSERT INTO transaction_line_items (transaction_bill_id, transaction_id, description, quantity, unit_price, amount)
       VALUES ($1, $2, $3, 1, 14999, 14999)`,
      [testBillId, testTransactionId, encrypt(rawLineItem)],
    );
  });

  after(async () => {
    if (testUserId && dbAvailable) {
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
  });

  describe('1. Direct PostgreSQL Inspection (Zero Plaintext at Rest)', () => {
    test('users table stores name and phone as AES-256-GCM ciphertexts', async (t) => {
      if (!dbAvailable) {
        t.skip('PostgreSQL is not available');
        return;
      }
      const row = (
        await pool.query('SELECT name, phone, phone_hash FROM users WHERE id = $1', [testUserId])
      ).rows[0];

      assert.ok(isEncrypted(row.name), 'users.name should be encrypted ciphertext');
      assert.ok(isEncrypted(row.phone), 'users.phone should be encrypted ciphertext');
      assert.ok(!row.name.includes(rawUserName), 'Raw name must not be in database column');
      assert.ok(!row.phone.includes(rawUserPhone), 'Raw phone must not be in database column');

      // Blind index check
      const expectedBlindIndex = computeBlindIndex(normalizePhoneNumber(rawUserPhone));
      assert.equal(row.phone_hash, expectedBlindIndex, 'phone_hash must match HMAC blind index');
    });

    test('statement_drafts table stores payload as encrypted JSON ciphertext', async (t) => {
      if (!dbAvailable) {
        t.skip('PostgreSQL is not available');
        return;
      }
      const row = (
        await pool.query('SELECT payload FROM statement_drafts WHERE statement_id = $1', [
          testStatementId,
        ])
      ).rows[0];

      assert.ok(row.payload.encrypted, 'statement_drafts.payload must have encrypted wrapper');
      assert.ok(isEncrypted(row.payload.encrypted), 'Inner payload must be AES-256-GCM ciphertext');
      const rawString = JSON.stringify(row.payload);
      assert.ok(
        !rawString.includes(rawTxnDescription),
        'No plaintext transaction description in draft',
      );
    });

    test('transactions table stores description as AES-256-GCM ciphertext', async (t) => {
      if (!dbAvailable) {
        t.skip('PostgreSQL is not available');
        return;
      }
      const row = (
        await pool.query('SELECT description FROM transactions WHERE id = $1', [testTransactionId])
      ).rows[0];

      assert.ok(isEncrypted(row.description), 'transactions.description must be encrypted');
      assert.ok(
        !row.description.includes(rawTxnDescription),
        'Raw description must not exist in transactions table',
      );
    });

    test('chat_messages table stores content and result as ciphertexts', async (t) => {
      if (!dbAvailable) {
        t.skip('PostgreSQL is not available');
        return;
      }
      const rows = (
        await pool.query(
          'SELECT role, content, result FROM chat_messages WHERE user_id = $1 ORDER BY sequence ASC',
          [testUserId],
        )
      ).rows;

      assert.equal(rows.length, 2);
      const userMsg = rows[0];
      const assistantMsg = rows[1];

      assert.ok(isEncrypted(userMsg.content), 'User question must be encrypted in database');
      assert.ok(
        !userMsg.content.includes(rawChatMessage),
        'Raw user question must not be in chat_messages table',
      );

      assert.ok(
        isEncrypted(assistantMsg.content),
        'Assistant answer must be encrypted in database',
      );
      assert.ok(
        !assistantMsg.content.includes(rawChatAnswer),
        'Raw answer must not be in chat_messages table',
      );

      assert.ok(assistantMsg.result.encrypted, 'Assistant result must be encrypted JSON object');
      assert.ok(isEncrypted(assistantMsg.result.encrypted));
    });

    test('transaction_bills and line_items store file_name, merchant_name, and items as ciphertexts', async (t) => {
      if (!dbAvailable) {
        t.skip('PostgreSQL is not available');
        return;
      }
      const billRow = (
        await pool.query(
          'SELECT file_name, merchant_name, payload FROM transaction_bills WHERE id = $1',
          [testBillId],
        )
      ).rows[0];

      assert.ok(isEncrypted(billRow.file_name), 'bill.file_name must be encrypted');
      assert.ok(isEncrypted(billRow.merchant_name), 'bill.merchant_name must be encrypted');
      assert.ok(billRow.payload.encrypted, 'bill.payload must have encrypted wrapper');

      const itemRow = (
        await pool.query(
          'SELECT description FROM transaction_line_items WHERE transaction_bill_id = $1',
          [testBillId],
        )
      ).rows[0];

      assert.ok(isEncrypted(itemRow.description), 'line_item.description must be encrypted');
      assert.ok(!itemRow.description.includes(rawLineItem));
    });
  });

  describe('2. Authorized Decryption & Blind Index Querying', () => {
    test('blind index finds user by normalized phone number without decrypting all rows', async (t) => {
      if (!dbAvailable) {
        t.skip('PostgreSQL is not available');
        return;
      }
      const lookupHash = computeBlindIndex(normalizePhoneNumber(rawUserPhone));
      const result = await pool.query('SELECT id, name, phone FROM users WHERE phone_hash = $1', [
        lookupHash,
      ]);

      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].id, testUserId);
      assert.equal(safeDecrypt(result.rows[0].name), rawUserName);
      assert.equal(safeDecrypt(result.rows[0].phone), rawUserPhone);
    });

    test('chatHistory.page transparently decrypts questions and answers for caller', async (t) => {
      if (!dbAvailable) {
        t.skip('PostgreSQL is not available');
        return;
      }
      const history = await chatHistory.page(pool, testUserId);
      assert.equal(history.messages.length, 2);

      const userMsg = history.messages[0];
      const assistantMsg = history.messages[1];

      assert.equal(userMsg.role, 'user');
      assert.equal(userMsg.content, rawChatMessage);

      assert.equal(assistantMsg.role, 'assistant');
      assert.equal(assistantMsg.content, rawChatAnswer);
      assert.equal(assistantMsg.result.answer, rawChatAnswer);
    });

    test('getUserDataExport provides clean, decrypted data for GDPR export & PDF generation', async (t) => {
      if (!dbAvailable) {
        t.skip('PostgreSQL is not available');
        return;
      }
      const archive = await getUserDataExport(pool, testUserId);

      assert.equal(archive.profile.name, rawUserName);
      assert.equal(archive.profile.phone, rawUserPhone);

      assert.ok(archive.transactions.length > 0);
      assert.equal(archive.transactions[0].description, rawTxnDescription);

      assert.ok(archive.bills.length > 0);
      assert.equal(archive.bills[0].merchant_name, rawMerchantName);
      assert.equal(archive.bills[0].file_name, 'invoice-amazon-98124.pdf');
      assert.equal(archive.bills[0].line_items[0].description, rawLineItem);

      assert.ok(archive.chatMessages.length > 0);
      assert.equal(archive.chatMessages[0].content, rawChatMessage);
      assert.equal(archive.chatMessages[1].content, rawChatAnswer);
    });

    test('safeDecrypt provides zero-downtime backward compatibility for legacy plaintext', () => {
      const legacyPlaintext = 'Legacy Plaintext Grocery Store';
      assert.equal(safeDecrypt(legacyPlaintext), legacyPlaintext);

      const encryptedText = encrypt('Secret Note');
      assert.equal(safeDecrypt(encryptedText), 'Secret Note');

      assert.equal(safeDecrypt(null), null);
      assert.equal(safeDecrypt(undefined), undefined);
    });
  });
});
