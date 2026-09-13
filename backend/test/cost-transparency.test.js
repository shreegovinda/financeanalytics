const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../config/db');
const { issueAuthToken } = require('../services/authToken');
const { getUserCostTransparency } = require('../services/costTransparencyService');

describe('User Cost & Infrastructure Transparency Service', () => {
  let testUserId;
  let testUserToken;
  let byokUserId;
  let dbAvailable = true;

  before(async () => {
    try {
      await pool.query('SELECT 1');
    } catch (err) {
      if (
        (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) &&
        !process.env.CI
      ) {
        console.warn('⚠️ Skipping real DB tests: PostgreSQL is not available.');
        dbAvailable = false;
        return;
      }
      throw err;
    }

    // 1. Create standard admin-mode test user
    const userRes = await pool.query(
      `INSERT INTO users (email, name, password_hash, currency, ai_key_mode, selected_ai_provider)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, token_version`,
      [`cost-user-${Date.now()}@example.com`, 'Cost Test User', 'hash', 'INR', 'admin', 'gemini'],
    );
    testUserId = userRes.rows[0].id;
    testUserToken = issueAuthToken(userRes.rows[0]);

    // 2. Create BYOK test user
    const byokRes = await pool.query(
      `INSERT INTO users (email, name, password_hash, currency, ai_key_mode, selected_ai_provider)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, token_version`,
      [
        `byok-user-${Date.now()}@example.com`,
        'BYOK Test User',
        'hash',
        'USD',
        'personal',
        'gemini',
      ],
    );
    byokUserId = byokRes.rows[0].id;

    // 3. Add mock statements, files, transactions, and chat messages for testUserId
    const stmtRes = await pool.query(
      `INSERT INTO statements (user_id, bank_name, file_name, status)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [testUserId, 'HDFC Bank', 'hdfc-stmt.pdf', 'completed'],
    );
    const stmtId = stmtRes.rows[0].id;

    // Add statement file bytes
    const dummyBuffer = Buffer.from(
      'PDF file content with statement data for testing cost calculations',
    );
    await pool.query(
      `INSERT INTO statement_files (statement_id, content, content_type)
       VALUES ($1, $2, $3)`,
      [stmtId, dummyBuffer, 'application/pdf'],
    );

    // Add transactions
    await pool.query(
      `INSERT INTO transactions (user_id, statement_id, date, amount, description, type)
       VALUES 
       ($1, $2, '2026-01-15', 500.00, 'Grocery Store', 'debit'),
       ($1, $2, '2026-01-16', 15000.00, 'Salary', 'credit')`,
      [testUserId, stmtId],
    );

    // Add chat message
    await pool.query(
      `INSERT INTO chat_messages (user_id, role, content)
       VALUES ($1, 'user', 'What is my net cash flow?'), ($1, 'assistant', 'Your net balance is 14500.')`,
      [testUserId],
    );
  });

  after(async () => {
    if (testUserId && dbAvailable) {
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
    if (byokUserId && dbAvailable) {
      await pool.query('DELETE FROM users WHERE id = $1', [byokUserId]);
    }
  });

  test('getUserCostTransparency aggregates usage and computes costs for platform-managed AI user', async (t) => {
    if (!dbAvailable) {
      t.skip('PostgreSQL is not available');
      return;
    }
    const data = await getUserCostTransparency(testUserId);

    assert.equal(data.currency, 'INR');
    assert.equal(data.is_byok, false);
    assert.equal(data.ai_provider, 'gemini');

    // Usage verification
    assert.equal(data.usage.statements_processed, 1);
    assert.equal(data.usage.statements_total, 1);
    assert.equal(data.usage.transactions_count, 2);
    assert.equal(data.usage.chat_messages_count, 2);
    assert.ok(data.usage.storage_bytes > 0, 'Storage bytes should be > 0');

    // Cost verification (in INR)
    assert.ok(data.costs.total_ai_cost > 0, 'AI cost should be > 0 for admin key mode');
    assert.ok(data.costs.total_infra_cost > 0, 'Infra cost should be > 0');
    assert.ok(data.costs.total_platform_cost > 0, 'Total cost should be > 0');
    assert.equal(
      data.costs.total_platform_cost,
      parseFloat((data.costs.total_ai_cost + data.costs.total_infra_cost).toFixed(3)),
    );

    // Disclosures
    assert.ok(data.disclosures.transparency_commitment);
    assert.ok(data.disclosures.byok_notice.includes('Finlytix-managed AI keys'));
  });

  test('getUserCostTransparency sets total_ai_cost to zero for Personal BYOK user', async (t) => {
    if (!dbAvailable) {
      t.skip('PostgreSQL is not available');
      return;
    }
    const data = await getUserCostTransparency(byokUserId);

    assert.equal(data.currency, 'USD');
    assert.equal(data.is_byok, true);
    assert.equal(data.costs.total_ai_cost, 0);
    assert.equal(data.costs.ai_parsing_cost, 0);
    assert.equal(data.costs.ai_chat_cost, 0);
    assert.ok(data.costs.total_infra_cost > 0);
    assert.ok(data.disclosures.byok_notice.includes('zero AI cost incurred by Finlytix'));
  });
});
