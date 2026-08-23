const assert = require('node:assert/strict');
const test = require('node:test');

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

function loadUploadRouter(pool) {
  const uploadPath = require.resolve('../routes/upload');
  const originalUpload = require.cache[uploadPath];
  delete require.cache[uploadPath];

  const restoreDb = mockModule('../config/db', pool);
  // Avoid pulling real AI/parser deps during route module load.
  const restoreClaude = mockModule('../services/claude', { categorizeBatch: async () => [] });
  const restoreAi = mockModule('../services/ai', {
    getProviderFromRequest: () => 'anthropic',
  });
  const restoreParser = mockModule('../services/parsers/generic', {
    parseStatement: async () => ({ bankName: 'TEST', transactions: [] }),
  });
  const restoreAuth = mockModule('../middleware/auth', (req, _res, next) => next());

  const router = require('../routes/upload');

  return {
    router,
    cleanup() {
      delete require.cache[uploadPath];
      if (originalUpload) {
        require.cache[uploadPath] = originalUpload;
      }
      restoreDb();
      restoreClaude();
      restoreAi();
      restoreParser();
      restoreAuth();
    },
  };
}

test('lockUserUploads serializes concurrent imports for the same user', async () => {
  const queries = [];
  const client = {
    async query(sql, params) {
      queries.push({ sql, params });
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async connect() {
      return client;
    },
    async query() {
      return { rows: [] };
    },
  };

  const { router, cleanup } = loadUploadRouter(pool);

  try {
    await router.lockUserUploads(client, 'user-1');

    assert.equal(queries.length, 1);
    assert.match(
      queries[0].sql,
      /pg_advisory_xact_lock/,
      'the import transaction must take a per-user advisory lock, otherwise two ' +
        'concurrent uploads of the same bank+month can both pass the ' +
        'check-then-insert guards under READ COMMITTED',
    );
    // Namespaced and keyed by user, so unrelated users are not serialized.
    assert.deepEqual(queries[0].params, [87421001, 'user-1']);
  } finally {
    cleanup();
  }
});

test('lockUserUploads keys the lock per user', async () => {
  const seen = [];
  const client = {
    async query(_sql, params) {
      seen.push(params[1]);
      return { rows: [] };
    },
    release() {},
  };
  const pool = {
    async connect() {
      return client;
    },
    async query() {
      return { rows: [] };
    },
  };
  const { router, cleanup } = loadUploadRouter(pool);

  try {
    await router.lockUserUploads(client, 'user-a');
    await router.lockUserUploads(client, 'user-b');
    assert.deepEqual(seen, ['user-a', 'user-b'], 'distinct users take distinct lock keys');
  } finally {
    cleanup();
  }
});

test('getInFlightStatement returns the newest processing statement for a user', async () => {
  const pool = {
    async query(sql, params) {
      assert.match(sql, /status = 'processing'/);
      assert.deepEqual(params, ['user-1']);
      return { rows: [{ id: 'stmt-9', file_name: 'latest.pdf' }] };
    },
  };

  const { router, cleanup } = loadUploadRouter(pool);

  try {
    const inFlight = await router.getInFlightStatement('user-1');
    assert.deepEqual(inFlight, { id: 'stmt-9', file_name: 'latest.pdf' });
  } finally {
    cleanup();
  }
});
