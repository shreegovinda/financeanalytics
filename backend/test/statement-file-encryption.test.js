const assert = require('node:assert/strict');
const test = require('node:test');
const { encryptBuffer, decryptBuffer } = require('../services/crypto');
const { migrateStatementFiles } = require('../scripts/migrate-encrypt-statement-files');

function mockModule(modulePath, exports) {
  const resolvedPath = require.resolve(modulePath);
  const originalModule = require.cache[resolvedPath];

  require.cache[resolvedPath] = {
    id: resolvedPath,
    filename: resolvedPath,
    loaded: true,
    exports,
  };

  return () => {
    if (originalModule) {
      require.cache[resolvedPath] = originalModule;
    } else {
      delete require.cache[resolvedPath];
    }
  };
}

function createMockRes() {
  const headers = {};
  return {
    statusCode: 200,
    body: null,
    headers,
    set(key, val) {
      headers[key] = val;
      return this;
    },
    attachment(name) {
      headers['Content-Disposition'] = `attachment; filename="${name}"`;
      return this;
    },
    type(t) {
      headers['Content-Type'] = t;
      return this;
    },
    send(data) {
      this.body = data;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };
}

test('download route decrypts statement_files when is_encrypted is true', async () => {
  const originalBytes = Buffer.from('%PDF-1.4 confidential bank statement content\n%%EOF');
  const encryptedBytes = encryptBuffer(originalBytes);

  const mockDb = {
    query: async () => ({
      rows: [
        {
          file_name: 'test-statement.pdf',
          content: encryptedBytes,
          content_type: 'application/pdf',
          is_encrypted: true,
        },
      ],
    }),
  };

  const uploadRouterPath = require.resolve('../routes/upload');
  delete require.cache[uploadRouterPath];
  const restoreDb = mockModule('../config/db', mockDb);
  const restoreAuth = mockModule('../middleware/auth', (req, _res, next) => next());

  const router = require('../routes/upload');
  const route = router.stack.find(
    (l) => l.route && l.route.path === '/:statementId/file' && l.route.methods.get,
  );
  assert.ok(route);

  const handler = route.route.stack[route.route.stack.length - 1].handle;
  const req = { params: { statementId: 'stmt-1' }, user: { id: 'user-1' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(Buffer.isBuffer(res.body));
  assert.equal(res.body.toString('utf8'), originalBytes.toString('utf8'));

  restoreDb();
  restoreAuth();
  delete require.cache[uploadRouterPath];
});

test('download route serves legacy unencrypted statement_files when is_encrypted is false', async () => {
  const rawLegacyBytes = Buffer.from('%PDF-1.4 legacy plaintext statement content\n%%EOF');

  const mockDb = {
    query: async () => ({
      rows: [
        {
          file_name: 'legacy-statement.pdf',
          content: rawLegacyBytes,
          content_type: 'application/pdf',
          is_encrypted: false,
        },
      ],
    }),
  };

  const uploadRouterPath = require.resolve('../routes/upload');
  delete require.cache[uploadRouterPath];
  const restoreDb = mockModule('../config/db', mockDb);
  const restoreAuth = mockModule('../middleware/auth', (req, _res, next) => next());

  const router = require('../routes/upload');
  const route = router.stack.find(
    (l) => l.route && l.route.path === '/:statementId/file' && l.route.methods.get,
  );
  assert.ok(route);

  const handler = route.route.stack[route.route.stack.length - 1].handle;
  const req = { params: { statementId: 'stmt-2' }, user: { id: 'user-1' } };
  const res = createMockRes();

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(Buffer.isBuffer(res.body));
  assert.equal(res.body.toString('utf8'), rawLegacyBytes.toString('utf8'));

  restoreDb();
  restoreAuth();
  delete require.cache[uploadRouterPath];
});

test('migrateStatementFiles forward and rollback migrations work idempotently', async () => {
  const originalPlaintext = Buffer.from('statement buffer for test migration');
  let storedRows = [
    { statement_id: 's-1', content: originalPlaintext, is_encrypted: false },
    { statement_id: 's-2', content: originalPlaintext, is_encrypted: false },
  ];

  const mockDb = {
    query: async (sql, params) => {
      if (sql.includes('SELECT statement_id, content')) {
        const targetIsEncrypted = params[0];
        const matching = storedRows.filter((r) => r.is_encrypted === targetIsEncrypted);
        return { rows: matching };
      }
      if (sql.includes('UPDATE statement_files')) {
        const [content, is_encrypted, statement_id] = params;
        const row = storedRows.find((r) => r.statement_id === statement_id);
        if (row) {
          row.content = content;
          row.is_encrypted = is_encrypted;
        }
        return { rowCount: 1 };
      }
      return { rows: [] };
    },
  };

  const restoreDb = mockModule('../config/db', mockDb);

  // 1. Forward Migration: Plaintext -> Encrypted
  const forwardResult = await migrateStatementFiles({ rollback: false }, mockDb);
  assert.equal(forwardResult.processedCount, 2);
  assert.equal(forwardResult.errorCount, 0);
  assert.equal(storedRows[0].is_encrypted, true);
  assert.notEqual(storedRows[0].content.toString('hex'), originalPlaintext.toString('hex'));

  // 2. Rollback Migration: Encrypted -> Plaintext
  const rollbackResult = await migrateStatementFiles({ rollback: true }, mockDb);
  assert.equal(rollbackResult.processedCount, 2);
  assert.equal(rollbackResult.errorCount, 0);
  assert.equal(storedRows[0].is_encrypted, false);
  assert.equal(storedRows[0].content.toString('utf8'), originalPlaintext.toString('utf8'));

  restoreDb();
});
