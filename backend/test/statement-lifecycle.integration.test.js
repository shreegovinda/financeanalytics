const test = require('node:test');
const assert = require('node:assert/strict');

// Explicit opt-in: exercises the running local API and local database using
// temporary users only. Never sends email or calls AI.
test(
  'statement download, deletion cascades, totals and month availability',
  { skip: process.env.RUN_LOCAL_DB_TESTS !== '1' },
  async () => {
    const pool = require('../config/db');
    const jwt = require('jsonwebtoken');
    const users = [];
    try {
      for (let i = 0; i < 2; i++)
        users.push(
          (
            await pool.query(
              "INSERT INTO users(email) VALUES ('statement-test-' || gen_random_uuid() || '@example.invalid') RETURNING id",
            )
          ).rows[0].id,
        );
      const [owner, other] = users;
      const request = (route, method = 'GET', user = owner) =>
        fetch((process.env.LOCAL_TEST_API || 'http://localhost:3003') + '/api/' + route, {
          method,
          headers: {
            Authorization:
              'Bearer ' + jwt.sign({ id: user, tokenVersion: 0 }, process.env.JWT_SECRET),
          },
        });
      const account = (
        await pool.query(
          "INSERT INTO user_bank_accounts(user_id,bank_code,catalogue_id) VALUES($1,'ICICI','ICICI') RETURNING id",
          [owner],
        )
      ).rows[0].id;
      const insert = () =>
        pool.query(
          "INSERT INTO statements(user_id,bank_account_id,bank_name,file_name,statement_month,file_format,status) VALUES($1,$2,'ICICI','original.pdf','2026-01-01','PDF','completed') RETURNING id",
          [owner, account],
        );
      const id = (await insert()).rows[0].id;
      const bytes = Buffer.from('%PDF-1.4\nlocal download test\n%%EOF');
      await pool.query(
        "INSERT INTO statement_files(statement_id,content,content_type) VALUES($1,$2,'application/pdf')",
        [id, bytes],
      );
      await pool.query("INSERT INTO statement_drafts(statement_id,payload) VALUES($1,'{}')", [id]);
      const txn = (
        await pool.query(
          "INSERT INTO transactions(user_id,statement_id,date,amount,description,type) VALUES($1,$2,'2026-01-15',125,'Test expense','debit') RETURNING id",
          [owner, id],
        )
      ).rows[0].id;
      const bill = (
        await pool.query(
          "INSERT INTO transaction_bills(user_id,transaction_id,file_name) VALUES($1,$2,'receipt.pdf') RETURNING id",
          [owner, txn],
        )
      ).rows[0].id;
      await pool.query(
        "INSERT INTO transaction_line_items(transaction_bill_id,transaction_id,description,amount) VALUES($1,$2,'Test item',125)",
        [bill, txn],
      );
      assert.equal((await request('upload/' + id + '/file', 'GET', other)).status, 404);
      assert.equal((await request('upload/' + id, 'DELETE', other)).status, 404);
      const download = await request('upload/' + id + '/file');
      assert.equal(download.status, 200);
      assert.match(download.headers.get('content-disposition'), /attachment/);
      assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
      assert.equal(
        Number((await (await request('transactions/stats/summary')).json()).total_expenses),
        125,
      );
      assert.equal((await (await request('upload/months')).json()).banks.ICICI.length, 1);
      assert.equal((await request('upload/' + id, 'DELETE')).status, 200);
      assert.equal((await request('upload/' + id + '/file')).status, 404);
      for (const [table, column, value] of [
        ['transactions', 'statement_id', id],
        ['statement_files', 'statement_id', id],
        ['statement_drafts', 'statement_id', id],
        ['transaction_bills', 'transaction_id', txn],
        ['transaction_line_items', 'transaction_id', txn],
      ]) {
        assert.equal(
          (await pool.query('SELECT 1 FROM ' + table + ' WHERE ' + column + '=$1', [value])).rows
            .length,
          0,
          table + ' must cascade',
        );
      }
      assert.equal(
        Number((await (await request('transactions/stats/summary')).json()).total_expenses),
        0,
      );
      assert.equal((await (await request('upload/months')).json()).banks.ICICI, undefined);
      await insert(); // same bank/year/month is available again
    } finally {
      for (const id of users) {
        await pool.query('DELETE FROM statements WHERE user_id=$1', [id]);
        await pool.query('DELETE FROM users WHERE id=$1', [id]);
      }
      await pool.end();
    }
  },
);
