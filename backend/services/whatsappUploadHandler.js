const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const {
  downloadMedia,
  sendTextMessage,
  sendInteractiveButtons,
  normalizePhoneNumber,
} = require('./whatsappService');
const { parseStatement } = require('./parsers/generic');
const { categorizeBatch } = require('./claude');
const { getUserAiExecutionConfig } = require('./ai');
const {
  encrypt,
  encryptJson,
  decryptJson,
  computeBlindIndex,
  safeDecrypt,
  encryptBuffer,
} = require('./crypto');
const { toSqlDate } = require('../utils/formatters');
const { validateTransactionMonth } = require('./statementDates');
const uploadRouter = require('../routes/upload');

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

/**
 * Extract bank and statement month hints from WhatsApp message caption
 * e.g., "HDFC Jan 2026", "Axis Bank 2026-02", "ICICI"
 */
function parseCaptionHints(caption) {
  if (!caption || typeof caption !== 'string') {
    return { bank: null, month: null };
  }

  const text = caption.trim().toUpperCase();

  // Known bank patterns
  let bank = null;
  if (text.includes('HDFC')) bank = 'HDFC';
  else if (text.includes('ICICI')) bank = 'ICICI';
  else if (text.includes('SBI') || text.includes('STATE BANK')) bank = 'SBI';
  else if (text.includes('AXIS')) bank = 'AXIS';
  else if (text.includes('KOTAK')) bank = 'KOTAK';
  else if (text.includes('PNB') || text.includes('PUNJAB')) bank = 'PNB';
  else if (text.includes('BOB') || text.includes('BARODA')) bank = 'BARODA';

  // Month pattern matching: YYYY-MM or Month YYYY (e.g. JAN 2026)
  let month = null;
  const isoMatch = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (isoMatch) {
    month = `${isoMatch[1]}-${isoMatch[2]}`;
  } else {
    const monthNames = {
      JAN: '01',
      FEB: '02',
      MAR: '03',
      APR: '04',
      MAY: '05',
      JUN: '06',
      JUL: '07',
      AUG: '08',
      SEP: '09',
      OCT: '10',
      NOV: '11',
      DEC: '12',
    };
    for (const [mName, mNum] of Object.entries(monthNames)) {
      const regex = new RegExp(`\\b${mName}[A-Z]*\\s*(20\\d{2})\\b`);
      const match = text.match(regex);
      if (match) {
        month = `${match[1]}-${mNum}`;
        break;
      }
    }
  }

  return { bank, month };
}

/**
 * Handles incoming document messages (PDF/XLSX) from WhatsApp
 */
async function handleWhatsAppDocumentUpload(fromPhone, document, messageId) {
  const normalizedPhone = normalizePhoneNumber(fromPhone);
  if (!document || !document.id) return;

  try {
    // 1. Resolve user by phone number blind index
    const phoneHash = computeBlindIndex(normalizedPhone);
    const userRes = await pool.query(
      `SELECT id, email, name, phone, phone_verified, currency, locale,
              selected_ai_provider, selected_ai_model, ai_key_mode
       FROM users
       WHERE phone_hash = $1
       LIMIT 1`,
      [phoneHash],
    );

    if (userRes.rows.length === 0) {
      await sendTextMessage(
        normalizedPhone,
        `👋 *Welcome to Finlytix!*\n\n` +
          `Your phone number (*+${normalizedPhone}*) is not yet linked to an active Finlytix account.\n` +
          `Please sign in at ${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth before uploading statements.`,
      );
      return;
    }

    const user = userRes.rows[0];
    user.name = safeDecrypt(user.name);
    user.phone = safeDecrypt(user.phone);

    // Inform user that analysis is starting
    await sendTextMessage(
      normalizedPhone,
      `⏳ Received *${document.filename || 'bank statement'}*.\nAnalyzing statement transactions with AI...`,
    );

    // 2. Download media file buffer
    const media = await downloadMedia(document.id);
    const originalContent = media.buffer;

    // Detect format
    const filename = (document.filename || 'statement.pdf').toLowerCase();
    const format = filename.endsWith('.xlsx') ? 'XLSX' : 'PDF';

    // Save temporarily for parser
    const tempFilePath = path.join(
      uploadDir,
      `wa_${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${filename}`,
    );
    fs.writeFileSync(tempFilePath, originalContent);

    try {
      // 3. Caption analysis & bank resolution
      const { bank: captionBank, month: captionMonth } = parseCaptionHints(document.caption || '');

      // Check user's linked banks
      const banksRes = await pool.query(
        `SELECT b.id, b.bank_code, c.name FROM user_bank_accounts b
         JOIN bank_catalogue c ON c.id = b.catalogue_id
         WHERE b.user_id = $1 AND b.active AND c.active`,
        [user.id],
      );

      let bankCode = captionBank;
      let bankAccountId = null;

      if (banksRes.rows.length > 0) {
        if (bankCode) {
          const matching = banksRes.rows.find(
            (b) =>
              b.bank_code.toUpperCase() === bankCode || b.name.toUpperCase().includes(bankCode),
          );
          if (matching) {
            bankAccountId = matching.id;
            bankCode = matching.bank_code;
          }
        }
        if (!bankAccountId) {
          // Default to user's first registered bank if not specified
          bankAccountId = banksRes.rows[0].id;
          bankCode = banksRes.rows[0].bank_code;
        }
      } else {
        bankCode = bankCode || 'GENERIC';
      }

      // 4. Run AI parsing
      let parsedStatement;
      let aiProviderId = user.selected_ai_provider || 'gemini';
      if (document.id && document.id.startsWith('mock_media_')) {
        parsedStatement = {
          bankName: bankCode || 'HDFC',
          statementMonth: captionMonth || '2026-01',
          transactions: [
            {
              date: `${captionMonth || '2026-01'}-15`,
              description: 'SALARY CREDIT MOCK',
              amount: 50000,
              type: 'credit',
            },
            {
              date: `${captionMonth || '2026-01'}-18`,
              description: 'AMAZON PURCHASE MOCK',
              amount: 2499,
              type: 'debit',
            },
          ],
        };
      } else {
        const aiConfig = await getUserAiExecutionConfig(pool, user.id, user.selected_ai_provider);
        aiProviderId = aiConfig.providerId;
        parsedStatement = await parseStatement(tempFilePath, aiConfig.providerId, {
          expectedBank: bankCode,
          expectedMonth: captionMonth || null,
          expectedFormat: format,
          apiKey: aiConfig.apiKey,
          model: aiConfig.model,
        });
      }

      const transactions = parsedStatement.transactions || [];
      if (transactions.length === 0) {
        await sendTextMessage(
          normalizedPhone,
          `⚠️ We could not detect any readable transactions in *${filename}*. Please check if the file is password-protected or try uploading on web.`,
        );
        return;
      }

      // Determine statement month from parsed transactions or caption
      const detectedMonth =
        captionMonth ||
        parsedStatement.statementMonth ||
        (transactions[0]?.date
          ? transactions[0].date.substring(0, 7)
          : new Date().toISOString().substring(0, 7));

      // Calculate totals
      let totalInflow = 0;
      let totalOutflow = 0;
      const formattedTxns = transactions.map((txn) => {
        const amt = Number(Number(txn.amount).toFixed(2));
        if (txn.type === 'credit') totalInflow += amt;
        else totalOutflow += amt;
        return {
          date: toSqlDate(txn.date),
          description: txn.description,
          amount: amt,
          type: txn.type,
        };
      });

      // 5. Store statement in database (encrypted file vault)
      const encryptedFileBuffer = encryptBuffer(originalContent);
      const client = await pool.connect();
      let statementId;

      try {
        await client.query('BEGIN');
        await uploadRouter.lockUserUploads(client, user.id);
        if (bankCode && detectedMonth) {
          await uploadRouter.ensureMonthNotAlreadyUploaded(
            client,
            user.id,
            bankCode,
            detectedMonth,
          );
        }

        const stmtInsert = await client.query(
          `INSERT INTO statements
           (user_id, bank_name, file_name, status, processing_stage, processing_progress,
            ai_provider, statement_month, file_format, detected_bank_name, bank_account_id)
           VALUES ($1, $2, $3, 'pending_review', 'awaiting_confirmation', 90, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            user.id,
            bankCode,
            document.filename || 'whatsapp_statement.pdf',
            aiProviderId,
            `${detectedMonth}-01`,
            format,
            parsedStatement.bankName || bankCode,
            bankAccountId,
          ],
        );
        statementId = stmtInsert.rows[0].id;

        // Store encrypted statement binary
        await client.query(
          `INSERT INTO statement_files (statement_id, content, content_type, is_encrypted)
           VALUES ($1, $2, $3, TRUE)`,
          [
            statementId,
            encryptedFileBuffer,
            format === 'PDF'
              ? 'application/pdf'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ],
        );

        // Store statement draft with encrypted payload
        const draftPayload = {
          bankName: bankCode,
          statementMonth: detectedMonth,
          transactions: formattedTxns,
        };

        const encryptedDraftPayload = { encrypted: encryptJson(draftPayload) };

        const draftInsert = await client.query(
          `INSERT INTO statement_drafts
           (statement_id, payload, transaction_count, total_debit, total_credit)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            statementId,
            JSON.stringify(encryptedDraftPayload),
            formattedTxns.length,
            totalOutflow,
            totalInflow,
          ],
        );
        const draftId = draftInsert.rows[0].id;

        // Track in whatsapp_conversations
        await client.query(
          `INSERT INTO whatsapp_conversations (user_id, phone, phone_hash, current_draft_id, last_message_id, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (user_id, phone)
           DO UPDATE SET phone_hash = $3, current_draft_id = $4, last_message_id = $5, updated_at = NOW()`,
          [user.id, normalizedPhone, phoneHash, draftId, messageId || null],
        );

        await client.query('COMMIT');
      } catch (dbErr) {
        await client.query('ROLLBACK').catch(() => {});
        throw dbErr;
      } finally {
        client.release();
      }

      // 6. Send interactive WhatsApp message with summary KPI and action buttons
      const currencySymbol =
        user.currency === 'INR' ? '₹' : user.currency === 'USD' ? '$' : user.currency;
      const summaryText =
        `📄 *Statement Analyzed: ${bankCode} (${detectedMonth})*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `• *Transactions Detected*: ${formattedTxns.length}\n` +
        `• *Total Inflow*: ${currencySymbol}${totalInflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n` +
        `• *Total Outflow*: ${currencySymbol}${totalOutflow.toLocaleString('en-IN', { minimumFractionDigits: 2 })}\n\n` +
        `Tap an action below to commit to your live ledger:`;

      await sendInteractiveButtons(normalizedPhone, summaryText, [
        { id: `btn_confirm_${statementId}`, title: '✅ Confirm & Import' },
        { id: `btn_view_${statementId}`, title: '📊 View Summary' },
        { id: `btn_discard_${statementId}`, title: '❌ Discard' },
      ]);
    } finally {
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
    }
  } catch (err) {
    console.error('❌ Error handling WhatsApp statement upload:', err);
    await sendTextMessage(
      normalizedPhone,
      `⚠️ Error processing statement: ${err.message || 'Unknown error'}. Please retry or upload via web dashboard.`,
    );
  }
}

/**
 * Handles interactive button replies (Confirm / View / Discard)
 */
async function handleWhatsAppInteractiveReply(fromPhone, buttonId, messageId) {
  const normalizedPhone = normalizePhoneNumber(fromPhone);
  if (!buttonId) return;

  try {
    const phoneHash = computeBlindIndex(normalizedPhone);
    const userRes = await pool.query(
      `SELECT id, currency, selected_ai_provider FROM users
       WHERE phone_hash = $1
       LIMIT 1`,
      [phoneHash],
    );

    if (userRes.rows.length === 0) return;
    const user = userRes.rows[0];

    // Extract statementId: e.g. btn_confirm_<statementId>
    const match = buttonId.match(/^btn_(confirm|view|discard)_(.+)$/);
    if (!match) return;

    const action = match[1];
    const statementId = match[2];

    if (action === 'confirm') {
      // Ingest draft transactions into ledger
      const client = await pool.connect();
      let txnIds = [];
      let transactions = [];
      let aiProvider = user.selected_ai_provider;

      try {
        await client.query('BEGIN');

        const draftRes = await client.query(
          `SELECT d.id, d.statement_id, d.payload, s.file_name, s.ai_provider, s.bank_name
           FROM statement_drafts d
           JOIN statements s ON s.id = d.statement_id
           WHERE d.statement_id = $1 AND s.user_id = $2`,
          [statementId, user.id],
        );

        if (draftRes.rows.length === 0) {
          await client.query('ROLLBACK');
          await sendTextMessage(normalizedPhone, '⚠️ No pending draft found for this statement.');
          return;
        }

        const draft = draftRes.rows[0];
        let payload = draft.payload;
        if (payload && payload.encrypted) {
          try {
            payload = decryptJson(payload.encrypted);
          } catch (e) {
            console.error('Failed to decrypt draft payload:', e);
          }
        }
        transactions = payload?.transactions || [];
        aiProvider = draft.ai_provider || aiProvider;

        if (transactions.length > 0) {
          const values = [];
          const placeholders = transactions.map((txn, index) => {
            const offset = index * 6;
            values.push(
              user.id,
              draft.statement_id,
              toSqlDate(txn.date),
              txn.amount,
              encrypt(txn.description),
              txn.type,
            );
            return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
          });

          const inserted = await client.query(
            `INSERT INTO transactions (user_id, statement_id, date, amount, description, type)
             VALUES ${placeholders.join(', ')}
             RETURNING id`,
            values,
          );
          txnIds = inserted.rows.map((r) => r.id);
        }

        // Remove draft & mark statement completed
        await client.query('DELETE FROM statement_drafts WHERE statement_id = $1', [statementId]);
        await client.query(
          `UPDATE statements
           SET status = 'completed', processing_stage = 'completed', processing_progress = 100, processed_at = NOW()
           WHERE id = $1 AND user_id = $2`,
          [statementId, user.id],
        );

        // Clear draft in whatsapp_conversations
        await client.query(
          'UPDATE whatsapp_conversations SET current_draft_id = NULL, updated_at = NOW() WHERE user_id = $1',
          [user.id],
        );

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK').catch(() => {});
        throw txErr;
      } finally {
        client.release();
      }

      // Trigger background categorization
      if (txnIds.length > 0) {
        setImmediate(async () => {
          try {
            const aiConfig = await getUserAiExecutionConfig(pool, user.id, aiProvider);
            const results = await categorizeBatch(transactions, aiConfig.providerId, {
              apiKey: aiConfig.apiKey,
              model: aiConfig.model,
            });
            const updateClient = await pool.connect();
            try {
              for (const r of results) {
                if (r.transactionIndex < txnIds.length) {
                  await updateClient.query(
                    'UPDATE transactions SET ai_suggested_category = $1 WHERE id = $2',
                    [r.category, txnIds[r.transactionIndex]],
                  );
                }
              }
            } finally {
              updateClient.release();
            }
          } catch (catErr) {
            console.warn('Background categorization error:', catErr.message);
          }
        });
      }

      await sendTextMessage(
        normalizedPhone,
        `✅ *Statement Successfully Imported!*\n\n` +
          `• *${txnIds.length} transactions* added to your live ledger.\n` +
          `• Intelligent spending categorization is running in the background.\n\n` +
          `You can now ask questions about this statement directly here in chat! 💬`,
      );
    } else if (action === 'view') {
      const draftRes = await pool.query(
        `SELECT d.payload, d.total_debit, d.total_credit, d.transaction_count
         FROM statement_drafts d
         JOIN statements s ON s.id = d.statement_id
         WHERE d.statement_id = $1 AND s.user_id = $2`,
        [statementId, user.id],
      );
      if (draftRes.rows.length === 0) {
        await sendTextMessage(normalizedPhone, '⚠️ No pending draft found.');
        return;
      }
      const draft = draftRes.rows[0];
      let payload = draft.payload;
      if (payload && payload.encrypted) {
        try {
          payload = decryptJson(payload.encrypted);
        } catch (e) {
          console.error('Failed to decrypt draft payload:', e);
        }
      }
      const txns = payload?.transactions || [];
      const topDebits = txns
        .filter((t) => t.type === 'debit')
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      let msg = `📊 *Top Expenses in Statement:*\n━━━━━━━━━━━━━━━━━━━\n`;
      topDebits.forEach((t) => {
        const cleanDesc = safeDecrypt(t.description) || '';
        msg += `• ${t.date}: *₹${t.amount.toFixed(2)}* (${cleanDesc.slice(0, 25)})\n`;
      });
      msg += `\nTap *Confirm & Import* to commit these to your ledger.`;

      await sendInteractiveButtons(normalizedPhone, msg, [
        { id: `btn_confirm_${statementId}`, title: '✅ Confirm & Import' },
        { id: `btn_discard_${statementId}`, title: '❌ Discard' },
      ]);
    } else if (action === 'discard') {
      const owned = await pool.query('SELECT id FROM statements WHERE id = $1 AND user_id = $2', [
        statementId,
        user.id,
      ]);
      if (owned.rows.length === 0) {
        await sendTextMessage(normalizedPhone, '⚠️ No pending draft found.');
        return;
      }
      await pool.query('DELETE FROM statement_drafts WHERE statement_id = $1', [statementId]);
      await pool.query(
        `UPDATE statements SET status = 'failed', processing_stage = 'discarded', processed_at = NOW() WHERE id = $1 AND user_id = $2`,
        [statementId, user.id],
      );
      await pool.query(
        'UPDATE whatsapp_conversations SET current_draft_id = NULL, updated_at = NOW() WHERE user_id = $1',
        [user.id],
      );
      await sendTextMessage(
        normalizedPhone,
        '❌ Statement draft discarded. No transactions were imported.',
      );
    }
  } catch (err) {
    console.error('❌ Error handling WhatsApp interactive button reply:', err);
    await sendTextMessage(normalizedPhone, '⚠️ Error processing action. Please try again.');
  }
}

module.exports = {
  parseCaptionHints,
  handleWhatsAppDocumentUpload,
  handleWhatsAppInteractiveReply,
};
