const test = require('node:test');
const assert = require('node:assert/strict');
const history = require('../services/chatHistory');
const { safeDecrypt, decryptJson } = require('../services/crypto');
test('history pages newest first in storage and returns chronological messages with cursor', async () => {
  let bindings;
  const pool = {
    query: async (_, params) => {
      bindings = params;
      return { rows: Array.from({ length: 101 }, (_, i) => ({ sequence: String(201 - i) })) };
    },
  };
  const page = await history.page(pool, 'owner', '202');
  assert.deepEqual(bindings, ['owner', '202']);
  assert.equal(page.messages.length, 100);
  assert.equal(page.messages[0].sequence, '102');
  assert.equal(page.messages[99].sequence, '201');
  assert.equal(page.before, '102');
  await assert.rejects(history.page(pool, 'owner', '1 OR 1=1'));
});
function database(version, failDelete = false) {
  const calls = [];
  const client = {
    query: async (sql, values) => {
      calls.push({ sql, values });
      if (failDelete && sql.startsWith('DELETE')) throw new Error('offline');
      return { rows: [{ chat_history_version: version }] };
    },
    release: () => calls.push({ sql: 'RELEASE' }),
  };
  return { calls, connect: async () => client };
}
test('deleted history cannot be recreated by an in-flight answer', async () => {
  const db = database(2);
  assert.equal(await history.save(db, 'owner', 1, 'question', { answer: 'answer' }), false);
  assert.ok(!db.calls.some((c) => c.sql.startsWith('INSERT')));
  assert.ok(db.calls.some((c) => c.sql.includes('FOR UPDATE')));
});
test('saving keeps user and assistant together, with evidence', async () => {
  const db = database(2);
  const result = { answer: 'answer', evidence: [{ expenses: 25 }] };
  assert.equal(await history.save(db, 'owner', 2, 'question', result), true);
  const insert = db.calls.find((c) => c.sql.startsWith('INSERT'));
  assert.equal(insert.values[0], 'owner');
  assert.equal(safeDecrypt(insert.values[1]), 'question');
  assert.equal(safeDecrypt(insert.values[2]), 'answer');
  const storedJson = JSON.parse(insert.values[3]);
  assert.ok(storedJson.encrypted);
  assert.deepEqual(decryptJson(storedJson.encrypted), result);
  assert.ok(db.calls.some((c) => c.sql === 'COMMIT'));
});
test('delete is user scoped and rolls back generation changes on failure', async () => {
  const db = database(1, true);
  await assert.rejects(history.remove(db, 'owner'));
  for (const call of db.calls.filter((c) => c.values)) assert.deepEqual(call.values, ['owner']);
  assert.ok(db.calls.some((c) => c.sql === 'ROLLBACK'));
  assert.equal(db.calls.at(-1).sql, 'RELEASE');
});
