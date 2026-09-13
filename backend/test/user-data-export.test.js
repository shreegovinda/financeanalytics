const assert = require('node:assert/strict');
const test = require('node:test');
const pdfParse = require('pdf-parse');
const { getUserDataExport, generateUserDataPdf } = require('../services/exportService');

test('getUserDataExport gathers complete user archive and excludes secrets', async () => {
  const mockPool = {
    async query(sql, params) {
      if (sql.includes('FROM users WHERE id = $1')) {
        return {
          rows: [
            {
              id: params[0],
              email: 'test@example.com',
              name: 'Export Tester',
              phone: '+919876543210',
              locale: 'en-IN',
              timezone: 'Asia/Kolkata',
              currency: 'INR',
              language: 'en',
              selected_ai_provider: 'gemini',
              selected_ai_model: 'gemini-2.5-flash',
              ai_key_mode: 'admin',
              email_verified: true,
              email_verified_at: '2026-09-12T00:00:00.000Z',
              created_at: '2026-09-12T00:00:00.000Z',
            },
          ],
        };
      }
      if (sql.includes('FROM user_bank_accounts')) {
        return {
          rows: [{ id: 'b1', bank_code: 'HDFC', active: true }],
        };
      }
      if (sql.includes('FROM statements s')) {
        return {
          rows: [
            {
              id: 's1',
              bank_name: 'HDFC Bank',
              file_name: 'hdfc_aug.pdf',
              status: 'completed',
              currency: 'INR',
            },
          ],
        };
      }
      if (sql.includes('FROM transactions t')) {
        return {
          rows: [
            {
              id: 't1',
              amount: '2500.00',
              type: 'debit',
              description: 'Grocery Store',
              category_name: 'Groceries',
              currency: 'INR',
            },
          ],
        };
      }
      if (sql.includes('FROM categories')) {
        return {
          rows: [{ id: 'c1', name: 'Groceries', color: '#22c55e' }],
        };
      }
      if (sql.includes('FROM transaction_bills')) {
        return {
          rows: [{ id: 'tb1', merchant_name: 'Supermarket', line_items: [] }],
        };
      }
      if (sql.includes('FROM payments')) {
        return { rows: [] };
      }
      if (sql.includes('FROM chat_messages')) {
        return {
          rows: [{ id: 'cm1', role: 'user', content: 'What did I spend on groceries?' }],
        };
      }
      if (sql.includes('FROM user_consents')) {
        return {
          rows: [{ id: 'uc1', policy_version: '2026-09-12', consented_at: '2026-09-12' }],
        };
      }
      return { rows: [] };
    },
  };

  const exportData = await getUserDataExport(mockPool, 'user-123');

  // Verify structure
  assert.ok(exportData.metadata);
  assert.equal(exportData.metadata.recordCounts.bankAccounts, 1);
  assert.equal(exportData.metadata.recordCounts.statements, 1);
  assert.equal(exportData.metadata.recordCounts.transactions, 1);
  assert.equal(exportData.metadata.recordCounts.categories, 1);
  assert.equal(exportData.metadata.recordCounts.chatMessages, 1);
  assert.equal(exportData.metadata.recordCounts.consentRecords, 1);

  // Verify exclusion of password_hash, token_version, and private keys
  const serialized = JSON.stringify(exportData);
  assert.equal(serialized.includes('password_hash'), false);
  assert.equal(serialized.includes('token_version'), false);
  assert.equal(serialized.includes('encrypted_key'), false);

  // Verify PDF generation from this export
  const pdfBuffer = await generateUserDataPdf(exportData);
  assert.ok(Buffer.isBuffer(pdfBuffer));
  assert.ok(pdfBuffer.length > 500);
  assert.equal(pdfBuffer.subarray(0, 4).toString(), '%PDF');
});

test('generateUserDataPdf renders full multi-page ledger with transactions and statements cleanly', async () => {
  const fullExportData = {
    metadata: {
      exportDate: '2026-09-13T01:30:00.000Z',
      schemaVersion: '1.0.0',
      platform: 'Finlytix Personal Finance Platform',
      recordCounts: {
        bankAccounts: 2,
        statements: 2,
        transactions: 35,
        categories: 4,
        bills: 1,
        payments: 0,
        chatMessages: 0,
        consentRecords: 1,
      },
    },
    profile: {
      id: 'u-full',
      email: 'user.full@example.com',
      name: 'Full Ledger User',
      phone: '+91 9988776655',
      locale: 'hi-IN', // Non-Latin locale to verify PDF font resilience
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    bankAccounts: [
      {
        catalogue_bank_name: 'HDFC Bank',
        bank_code: 'HDFC',
        active: true,
        created_at: '2026-01-01',
      },
      {
        catalogue_bank_name: 'State Bank of India',
        bank_code: 'SBI',
        active: true,
        created_at: '2026-01-02',
      },
    ],
    statements: [
      {
        bank_name: 'HDFC Bank',
        file_name: 'hdfc_statement_jan.pdf',
        statement_month: '2026-01',
        file_format: 'PDF',
        status: 'completed',
        transaction_count: 25,
        total_debit: '45000.00',
        total_credit: '120000.00',
        uploaded_at: '2026-02-01T10:00:00.000Z',
      },
      {
        bank_name: 'State Bank of India',
        file_name: 'sbi_statement_feb.xlsx',
        statement_month: '2026-02',
        file_format: 'XLSX',
        status: 'completed',
        transaction_count: 10,
        total_debit: '12500.00',
        total_credit: '0.00',
        uploaded_at: '2026-03-01T10:00:00.000Z',
      },
    ],
    transactions: Array.from({ length: 35 }).map((_, i) => ({
      id: `t-${i + 1}`,
      date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      bank_name: i % 2 === 0 ? 'HDFC Bank' : 'State Bank of India',
      description: `Test Transaction Description ${i + 1} with merchant detail`,
      category_name: ['Food & Dining', 'Shopping', 'Utilities', 'Salary', 'Transport'][i % 5],
      type: i % 5 === 3 ? 'credit' : 'debit',
      amount: i % 5 === 3 ? '120000.00' : `${(i + 1) * 250}.50`,
      currency: 'INR',
    })),
    categories: [
      { name: 'Food & Dining' },
      { name: 'Shopping' },
      { name: 'Utilities' },
      { name: 'Salary' },
      { name: 'Transport' },
    ],
    bills: [
      {
        merchant_name: 'Supermarket Grocery',
        bill_date: '2026-01-15',
        bill_total: '1250.00',
        status: 'confirmed',
      },
    ],
    consents: [{ policy_version: '2026-09-12', consented_at: '2026-01-01T00:00:00.000Z' }],
  };

  const pdfBuf = await generateUserDataPdf(fullExportData);
  assert.ok(Buffer.isBuffer(pdfBuf));
  // Verify PDF content via parser
  const parsedPdf = await pdfParse(pdfBuf);
  assert.ok(parsedPdf.text.includes('Finlytix Personal Financial Report'));
  assert.ok(parsedPdf.text.includes('HDFC Bank'));
  assert.ok(parsedPdf.text.includes('Jan 2026')); // formatted month
  assert.ok(parsedPdf.text.includes('15 Jan 2026')); // formatted transaction date
  assert.ok(parsedPdf.numpages >= 2); // Multi-page ledger
});

test('generateUserDataPdf renders empty ledger gracefully without crashing', async () => {
  const emptyExportData = {
    metadata: {
      exportDate: '2026-09-13T01:30:00.000Z',
      recordCounts: {
        bankAccounts: 0,
        statements: 0,
        transactions: 0,
        categories: 0,
        bills: 0,
      },
    },
    profile: {
      email: 'empty@example.com',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      locale: 'en-IN',
    },
    bankAccounts: [],
    statements: [],
    transactions: [],
    categories: [],
    bills: [],
  };

  const pdfBuf = await generateUserDataPdf(emptyExportData);
  assert.ok(Buffer.isBuffer(pdfBuf));
  assert.ok(pdfBuf.length > 500);
  assert.equal(pdfBuf.subarray(0, 4).toString(), '%PDF');
});
