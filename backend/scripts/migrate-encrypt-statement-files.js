const pool = require('../config/db');
const { encryptBuffer, decryptBuffer } = require('../services/crypto');

async function migrateStatementFiles(options = {}, customPool = null) {
  const db = customPool || pool;
  const rollback = Boolean(options.rollback);
  const targetIsEncrypted = rollback ? true : false;
  const newIsEncrypted = rollback ? false : true;

  console.log(
    rollback
      ? '🔓 [MIGRATION] Rolling back statement files encryption...'
      : '🔒 [MIGRATION] Encrypting statement files with application-level AES-256-GCM...',
  );

  let cursor = null;
  const batchSize = 50;
  let processedCount = 0;
  let errorCount = 0;

  while (true) {
    const batch = cursor
      ? await db.query(
          `SELECT statement_id, content, content_type
           FROM statement_files
           WHERE is_encrypted = $1 AND statement_id > $2
           ORDER BY statement_id
           LIMIT $3`,
          [targetIsEncrypted, cursor, batchSize],
        )
      : await db.query(
          `SELECT statement_id, content, content_type
           FROM statement_files
           WHERE is_encrypted = $1
           ORDER BY statement_id
           LIMIT $2`,
          [targetIsEncrypted, batchSize],
        );

    if (batch.rows.length === 0) {
      break;
    }

    for (const row of batch.rows) {
      cursor = row.statement_id;
      try {
        let transformed;
        if (rollback) {
          transformed = decryptBuffer(row.content);
        } else {
          transformed = encryptBuffer(row.content);
        }

        await db.query(
          `UPDATE statement_files
           SET content = $1, is_encrypted = $2
           WHERE statement_id = $3`,
          [transformed, newIsEncrypted, row.statement_id],
        );
        processedCount++;
      } catch (err) {
        errorCount++;
        console.error(`Error migrating statement_id ${row.statement_id}:`, err.message);
      }
    }
  }

  console.log(
    `✅ [MIGRATION] Complete. Processed ${processedCount} file(s) with ${errorCount} error(s).`,
  );
  return { processedCount, errorCount };
}

if (require.main === module) {
  const isRollback = process.argv.includes('--rollback');
  migrateStatementFiles({ rollback: isRollback })
    .then(() => pool.end())
    .catch((err) => {
      console.error('Migration failed:', err);
      pool.end();
      process.exit(1);
    });
}

module.exports = { migrateStatementFiles };
