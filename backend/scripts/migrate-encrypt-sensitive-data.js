const pool = require('../config/db');
const { encrypt, encryptJson, isEncrypted, computeBlindIndex } = require('../services/crypto');
const { normalizePhoneNumber } = require('../services/whatsappService');

async function migrateSensitiveData(customPool = null) {
  const db = customPool || pool;
  console.log(
    '🔒 [MIGRATION] Encrypting sensitive data at rest with AES-256-GCM & Blind Indexing...',
  );

  // 1. Users (name, phone, phone_hash)
  const usersRes = await db.query('SELECT id, name, phone, phone_hash FROM users');
  let userCount = 0;
  for (const user of usersRes.rows) {
    let updated = false;
    let encName = user.name;
    let encPhone = user.phone;
    let phoneHash = user.phone_hash;

    if (user.phone) {
      if (!phoneHash) {
        phoneHash = computeBlindIndex(normalizePhoneNumber(user.phone));
        updated = true;
      }
      if (!isEncrypted(user.phone)) {
        encPhone = encrypt(user.phone);
        updated = true;
      }
    }

    if (user.name && !isEncrypted(user.name)) {
      encName = encrypt(user.name);
      updated = true;
    }

    if (updated) {
      await db.query('UPDATE users SET name = $1, phone = $2, phone_hash = $3 WHERE id = $4', [
        encName,
        encPhone,
        phoneHash,
        user.id,
      ]);
      userCount++;
    }
  }
  console.log(`✓ Users: encrypted and indexed ${userCount} profile(s)`);

  // 2. Statement Drafts (payload)
  const draftsRes = await db.query('SELECT id, payload FROM statement_drafts');
  let draftCount = 0;
  for (const draft of draftsRes.rows) {
    if (draft.payload && !draft.payload.encrypted) {
      const encryptedPayload = { encrypted: encryptJson(draft.payload) };
      await db.query('UPDATE statement_drafts SET payload = $1 WHERE id = $2', [
        encryptedPayload,
        draft.id,
      ]);
      draftCount++;
    }
  }
  console.log(`✓ Statement Drafts: encrypted ${draftCount} staging draft(s)`);

  // 3. Transactions (description)
  const txnsRes = await db.query('SELECT id, description FROM transactions');
  let txnCount = 0;
  for (const txn of txnsRes.rows) {
    if (txn.description && !isEncrypted(txn.description)) {
      await db.query('UPDATE transactions SET description = $1 WHERE id = $2', [
        encrypt(txn.description),
        txn.id,
      ]);
      txnCount++;
    }
  }
  console.log(`✓ Transactions: encrypted ${txnCount} narrative(s)`);

  // 4. Chat Messages (content, result)
  const msgsRes = await db.query('SELECT id, content, result FROM chat_messages');
  let msgCount = 0;
  for (const msg of msgsRes.rows) {
    let updated = false;
    let encContent = msg.content;
    let encResult = msg.result;

    if (msg.content && !isEncrypted(msg.content)) {
      encContent = encrypt(msg.content);
      updated = true;
    }

    if (msg.result && !msg.result.encrypted) {
      encResult = { encrypted: encryptJson(msg.result) };
      updated = true;
    }

    if (updated) {
      await db.query('UPDATE chat_messages SET content = $1, result = $2 WHERE id = $3', [
        encContent,
        encResult,
        msg.id,
      ]);
      msgCount++;
    }
  }
  console.log(`✓ Chat Messages: encrypted ${msgCount} conversation record(s)`);

  // 5. Transaction Bills (merchant_name, file_name, payload)
  const billsRes = await db.query(
    'SELECT id, merchant_name, file_name, payload FROM transaction_bills',
  );
  let billCount = 0;
  for (const bill of billsRes.rows) {
    let updated = false;
    let encMerchant = bill.merchant_name;
    let encFile = bill.file_name;
    let encPayload = bill.payload;

    if (bill.merchant_name && !isEncrypted(bill.merchant_name)) {
      encMerchant = encrypt(bill.merchant_name);
      updated = true;
    }
    if (bill.file_name && !isEncrypted(bill.file_name)) {
      encFile = encrypt(bill.file_name);
      updated = true;
    }
    if (bill.payload && !bill.payload.encrypted) {
      encPayload = { encrypted: encryptJson(bill.payload) };
      updated = true;
    }

    if (updated) {
      await db.query(
        'UPDATE transaction_bills SET merchant_name = $1, file_name = $2, payload = $3 WHERE id = $4',
        [encMerchant, encFile, encPayload, bill.id],
      );
      billCount++;
    }
  }
  console.log(`✓ Transaction Bills: encrypted ${billCount} merchant receipt(s)`);

  // 6. Transaction Line Items (description)
  const itemsRes = await db.query('SELECT id, description FROM transaction_line_items');
  let itemCount = 0;
  for (const item of itemsRes.rows) {
    if (item.description && !isEncrypted(item.description)) {
      await db.query('UPDATE transaction_line_items SET description = $1 WHERE id = $2', [
        encrypt(item.description),
        item.id,
      ]);
      itemCount++;
    }
  }
  console.log(`✓ Line Items: encrypted ${itemCount} item description(s)`);

  console.log('✅ [MIGRATION] All sensitive data encrypted at rest.');
  return { userCount, draftCount, txnCount, msgCount, billCount, itemCount };
}

if (require.main === module) {
  migrateSensitiveData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { migrateSensitiveData };
