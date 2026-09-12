const test = require('node:test');
const assert = require('node:assert/strict');
test(
  'chat retrieval isolates users and computes exact database totals',
  { skip: process.env.RUN_LOCAL_DB_TESTS !== '1' },
  async () => {
    const pool = require('../config/db');
    const { collectData } = require('../services/chatData');
    const ids = [];
    try {
      for (let n = 0; n < 2; n++) {
        const id = (
          await pool.query(
            "INSERT INTO users(email,name) VALUES ('chat-test-' || gen_random_uuid() || '@example.invalid',$1) RETURNING id",
            ['Chat test ' + n],
          )
        ).rows[0].id;
        ids.push(id);
        const statement = (
          await pool.query(
            "INSERT INTO statements(user_id,bank_name,file_name,statement_month,status) VALUES($1,'ICICI','test.pdf','2026-01-01','completed') RETURNING id",
            [id],
          )
        ).rows[0].id;
        await pool.query(
          "INSERT INTO transactions(user_id,statement_id,date,amount,description,type) VALUES($1,$2,'2026-01-12',$3,$4,'debit')",
          [id, statement, n === 0 ? 125 : 99999, n === 0 ? 'Owner purchase' : 'OTHER USER PRIVATE'],
        );
      }
      const data = await collectData(pool, ids[0], [
        { tool: 'finance', args: { startDate: '2026-01-01', endDate: '2026-01-31' } },
        { tool: 'statements' },
        { tool: 'profile' },
      ]);
      assert.equal(Number(data[0].summary.expenses), 125);
      assert.equal(Number(data[0].summary.transaction_count), 1);
      assert.equal(data[1].data.length, 1);
      assert.equal(data[2].data[0].name, 'Chat test 0');
      assert.ok(!JSON.stringify(data).includes('OTHER USER PRIVATE'));
      assert.ok(!JSON.stringify(data).includes('password'));
      const noMatches = await collectData(pool, ids[0], [
        { tool: 'finance', args: { search: "%' OR 1=1 --" } },
      ]);
      assert.equal(Number(noMatches[0].summary.transaction_count), 0);
      const { answerQuestion } = require('../services/chat');
      let step = 0;
      const fakeModel = async () =>
        ++step === 1
          ? { requests: [{ tool: 'finance', args: {} }] }
          : { answer: 'Your expenses are 125.', sourceIds: ['finance', 'external'] };
      const answer = await answerQuestion(
        pool,
        ids[0],
        'What are my expenses?',
        [],
        'gemini',
        fakeModel,
      );
      assert.equal(Number(answer.evidence[0].expenses), 125);
      assert.deepEqual(
        answer.sources.map((s) => s.id),
        ['finance'],
      );
    } finally {
      for (const id of ids) {
        await pool.query('DELETE FROM statements WHERE user_id=$1', [id]);
        await pool.query('DELETE FROM users WHERE id=$1', [id]);
      }
      await pool.end();
    }
  },
);
