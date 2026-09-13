const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const pool = require('../config/db');
const {
  normalizePhoneNumber,
  verifyWebhookSignature,
  sendTextMessage,
  sendInteractiveButtons,
  sendOtpTemplate,
  simulatedMessages,
} = require('../services/whatsappService');
const {
  parseCaptionHints,
  handleWhatsAppDocumentUpload,
  handleWhatsAppInteractiveReply,
} = require('../services/whatsappUploadHandler');
const { handleWhatsAppChatMessage } = require('../services/whatsappChatHandler');
const { sendWhatsAppOTP, verifyPhoneOTP, storePhoneOTP, OTP_PURPOSES } = require('../services/otp');

const { computeBlindIndex, encrypt } = require('../services/crypto');

describe('WhatsApp Platform Integration Suite', () => {
  let testUserId;
  const testPhone = '+919876500001';
  const normalizedTestPhone = '919876500001';
  let dbAvailable = true;

  before(async () => {
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        console.warn('⚠️ Skipping real DB tests: PostgreSQL is not available.');
        dbAvailable = false;
        return;
      }
      throw err;
    }

    // Create test user with phone and blind index
    const phoneHash = computeBlindIndex(normalizePhoneNumber(testPhone));
    const userRes = await pool.query(
      `INSERT INTO users (email, name, phone, phone_hash, phone_verified, currency, selected_ai_provider, selected_ai_model, ai_key_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        `wa-test-${Date.now()}@example.com`,
        encrypt('WhatsApp Test User'),
        encrypt(testPhone),
        phoneHash,
        true,
        'INR',
        'gemini',
        'gemini-2.5-flash',
        'admin',
      ],
    );
    testUserId = userRes.rows[0].id;
  });

  after(async () => {
    if (testUserId && dbAvailable) {
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
  });

  describe('1. Phone Number Normalization & Signature Security', () => {
    test('normalizePhoneNumber formats 10-digit Indian numbers with country code', () => {
      assert.equal(normalizePhoneNumber('9876543210'), '919876543210');
      assert.equal(normalizePhoneNumber('+919876543210'), '919876543210');
      assert.equal(normalizePhoneNumber('+91 98765 43210'), '919876543210');
      assert.equal(normalizePhoneNumber(''), '');
    });

    test('verifyWebhookSignature validates genuine HMAC-SHA256 signatures', () => {
      const secret = 'my_test_whatsapp_secret';
      const body = Buffer.from(JSON.stringify({ event: 'test' }));
      const validHmac = crypto.createHmac('sha256', secret).update(body).digest('hex');
      const validHeader = `sha256=${validHmac}`;

      assert.equal(verifyWebhookSignature(body, validHeader, secret), true);
      assert.equal(verifyWebhookSignature(body, 'sha256=invalid_hex_string', secret), false);
      assert.equal(verifyWebhookSignature(body, 'wrong_format', secret), false);
      assert.equal(verifyWebhookSignature(body, validHeader, ''), false);
      assert.equal(verifyWebhookSignature(body, undefined, secret), false);
    });
  });

  describe('2. WhatsApp OTP & Phone Verification Lifecycle', () => {
    test('sendWhatsAppOTP stores code and dispatches WhatsApp template', async (t) => {
      if (!dbAvailable) {
        t.skip('PostgreSQL is not available');
        return;
      }
      const initialCount = simulatedMessages.length;
      const res = await sendWhatsAppOTP(
        testPhone,
        'http://localhost:3000/auth?wa_token=123',
        OTP_PURPOSES.WHATSAPP_LOGIN,
      );

      assert.equal(res.success, true);
      assert.ok(res.code && res.code.length === 6);
      assert.equal(simulatedMessages.length, initialCount + 1);

      const lastMsg = simulatedMessages[simulatedMessages.length - 1];
      assert.equal(lastMsg.to, normalizedTestPhone);
      assert.ok(lastMsg.text.includes(res.code));
      assert.ok(lastMsg.text.includes('Finlytix Security Code'));
    });

    test('verifyPhoneOTP succeeds with valid code and rejects invalid/reused codes', async (t) => {
      if (!dbAvailable) {
        t.skip('PostgreSQL is not available');
        return;
      }
      const testCode = '654321';
      await storePhoneOTP(normalizedTestPhone, testCode, OTP_PURPOSES.PHONE_VERIFY);

      // 1. Wrong code fails
      const failRes = await verifyPhoneOTP(
        normalizedTestPhone,
        '000000',
        OTP_PURPOSES.PHONE_VERIFY,
      );
      assert.equal(failRes.success, false);

      // 2. Correct code succeeds
      const successRes = await verifyPhoneOTP(
        normalizedTestPhone,
        testCode,
        OTP_PURPOSES.PHONE_VERIFY,
      );
      assert.equal(successRes.success, true);

      // 3. Replay of same code fails (atomic single-use)
      const replayRes = await verifyPhoneOTP(
        normalizedTestPhone,
        testCode,
        OTP_PURPOSES.PHONE_VERIFY,
      );
      assert.equal(replayRes.success, false);
    });
  });

  describe('3. WhatsApp Caption Parsing & Document Ingestion', () => {
    test('parseCaptionHints extracts bank and month from multiple phrasing formats', () => {
      const res1 = parseCaptionHints('HDFC Jan 2026');
      assert.equal(res1.bank, 'HDFC');
      assert.equal(res1.month, '2026-01');

      const res2 = parseCaptionHints('Axis Bank statement for 2026-02');
      assert.equal(res2.bank, 'AXIS');
      assert.equal(res2.month, '2026-02');

      const res3 = parseCaptionHints('ICICI Bank March 2026');
      assert.equal(res3.bank, 'ICICI');
      assert.equal(res3.month, '2026-03');

      const res4 = parseCaptionHints('Random document description');
      assert.equal(res4.bank, null);
      assert.equal(res4.month, null);
    });

    test('handleWhatsAppDocumentUpload creates statement draft and dispatches interactive buttons', async (t) => {
      if (!dbAvailable) {
        t.skip('PostgreSQL is not available');
        return;
      }
      const initialCount = simulatedMessages.length;
      const mockDoc = {
        id: 'mock_media_12345',
        filename: 'hdfc_statement_jan.pdf',
        caption: 'HDFC Jan 2026',
      };

      await handleWhatsAppDocumentUpload(testPhone, mockDoc, 'wamid_doc_1');

      // Check that interactive buttons were sent
      const buttonMessages = simulatedMessages.filter((m) => m.type === 'interactive_button');
      assert.ok(buttonMessages.length > 0);

      const lastBtnMsg = buttonMessages[buttonMessages.length - 1];
      assert.equal(lastBtnMsg.to, normalizedTestPhone);
      assert.ok(lastBtnMsg.body.includes('HDFC'));
      assert.equal(lastBtnMsg.buttons.length, 3);
      assert.ok(lastBtnMsg.buttons.some((b) => b.title.includes('Confirm')));
      assert.ok(lastBtnMsg.buttons.some((b) => b.title.includes('Discard')));

      // Verify draft in database
      const draftRes = await pool.query(
        `SELECT d.id, d.statement_id, d.payload, s.status, s.bank_name
         FROM statement_drafts d
         JOIN statements s ON s.id = d.statement_id
         WHERE s.user_id = $1`,
        [testUserId],
      );
      assert.ok(draftRes.rows.length > 0);
      const draft = draftRes.rows[0];
      assert.equal(draft.status, 'pending_review');
      assert.equal(draft.bank_name, 'HDFC');

      // Test interactive confirm action
      await handleWhatsAppInteractiveReply(
        testPhone,
        `btn_confirm_${draft.statement_id}`,
        'wamid_reply_1',
      );

      // Verify statement completed and transactions imported
      const completedStmt = await pool.query(
        'SELECT status, processing_stage FROM statements WHERE id = $1',
        [draft.statement_id],
      );
      assert.equal(completedStmt.rows[0].status, 'completed');

      // Verify draft deleted
      const clearedDraft = await pool.query(
        'SELECT id FROM statement_drafts WHERE statement_id = $1',
        [draft.statement_id],
      );
      assert.equal(clearedDraft.rows.length, 0);

      // Verify transactions imported
      const txnsRes = await pool.query(
        'SELECT count(*) FROM transactions WHERE statement_id = $1',
        [draft.statement_id],
      );
      assert.ok(parseInt(txnsRes.rows[0].count, 10) > 0);
    });
  });

  describe('4. WhatsApp Conversational AI Financial Assistant', () => {
    test('handleWhatsAppChatMessage handles unrecognized phone with onboarding link', async (t) => {
      if (!dbAvailable) {
        t.skip('PostgreSQL is not available');
        return;
      }
      const unregPhone = '+919999999999';
      const initialCount = simulatedMessages.length;

      await handleWhatsAppChatMessage(unregPhone, 'What is my balance?', 'wamid_chat_unreg');

      assert.equal(simulatedMessages.length, initialCount + 1);
      const reply = simulatedMessages[simulatedMessages.length - 1];
      assert.equal(reply.to, '919999999999');
      assert.ok(reply.text.includes('Welcome to Finlytix'));
      assert.ok(reply.text.includes('not yet linked'));
    });

    test('handleWhatsAppChatMessage answers financial queries for verified user', async (t) => {
      if (!dbAvailable) {
        t.skip('PostgreSQL is not available');
        return;
      }
      const initialCount = simulatedMessages.length;

      await handleWhatsAppChatMessage(
        testPhone,
        'What did I spend on groceries?',
        'wamid_chat_reg',
      );

      assert.equal(simulatedMessages.length, initialCount + 1);
      const reply = simulatedMessages[simulatedMessages.length - 1];
      assert.equal(reply.to, normalizedTestPhone);
      assert.ok(reply.text.length > 0);
    });
  });
});
