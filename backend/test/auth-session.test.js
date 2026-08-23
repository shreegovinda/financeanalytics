const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');
const { issueAuthToken } = require('../services/authToken');

const dbPath = require.resolve('../config/db');
const middlewarePath = require.resolve('../middleware/auth');

process.env.JWT_SECRET = 'test-jwt-secret';

function loadMiddleware(tokenVersion) {
  delete require.cache[middlewarePath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: {
      query: async (query, params) => {
        assert.match(query, /SELECT token_version FROM users/);
        assert.deepEqual(params, ['user-1']);
        return { rows: tokenVersion === null ? [] : [{ token_version: tokenVersion }] };
      },
    },
  };
  return require(middlewarePath);
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function authenticate(payload, storedTokenVersion) {
  const middleware = loadMiddleware(storedTokenVersion);
  const token = jwt.sign(payload, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = createResponse();
  let nextCalled = false;

  await middleware(req, res, () => {
    nextCalled = true;
  });

  return { req, res, nextCalled };
}

test('issues tokens with the current user token version', () => {
  const token = issueAuthToken({
    id: 'user-1',
    email: 'user@example.com',
    token_version: 3,
  });

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  assert.equal(decoded.tokenVersion, 3);
});

test('accepts legacy tokens while the user remains at token version zero', async () => {
  const result = await authenticate({ id: 'user-1', email: 'user@example.com' }, 0);

  assert.equal(result.nextCalled, true);
  assert.equal(result.req.user.id, 'user-1');
});

test('rejects an old token after the password increments the token version', async () => {
  const result = await authenticate(
    { id: 'user-1', email: 'user@example.com', tokenVersion: 0 },
    1,
  );

  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 401);
  assert.deepEqual(result.res.body, { error: 'Invalid token' });
});

test('accepts a replacement token with the current token version', async () => {
  const result = await authenticate(
    { id: 'user-1', email: 'user@example.com', tokenVersion: 2 },
    2,
  );

  assert.equal(result.nextCalled, true);
  assert.equal(result.req.user.tokenVersion, 2);
});

test('rejects tokens whose user no longer exists', async () => {
  const result = await authenticate(
    { id: 'user-1', email: 'user@example.com', tokenVersion: 0 },
    null,
  );

  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 401);
});
