const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeBankName, normalizeTransactions } = require('../services/parsers/generic');

// normalizeTransactions is the last line of defence between an AI model's JSON
// output and the transactions table. Everything it lets through becomes money
// in a user's dashboard, so the rejection rules are tested explicitly.

test('normalizeTransactions: keeps a well-formed transaction', () => {
  const [txn] = normalizeTransactions([
    { date: '2026-04-05', description: 'SWIGGY ORDER', amount: 450.5, type: 'debit' },
  ]);

  assert.equal(txn.description, 'SWIGGY ORDER');
  assert.equal(txn.amount, 450.5);
  assert.equal(txn.type, 'debit');
  assert.ok(txn.date instanceof Date);
});

test('normalizeTransactions: forces amounts positive and keeps direction in type', () => {
  const [debit, credit] = normalizeTransactions([
    { date: '2026-04-05', description: 'ATM WITHDRAWAL', amount: -2000, type: 'debit' },
    { date: '2026-04-06', description: 'SALARY', amount: 100000, type: 'credit' },
  ]);

  assert.equal(debit.amount, 2000, 'negative amounts are stored as positive magnitudes');
  assert.equal(debit.type, 'debit');
  assert.equal(credit.amount, 100000);
  assert.equal(credit.type, 'credit');
});

test('normalizeTransactions: accepts numeric strings from the model', () => {
  const [txn] = normalizeTransactions([
    { date: '2026-04-05', description: 'UPI PAYMENT', amount: '1234.56', type: 'DEBIT' },
  ]);

  assert.equal(txn.amount, 1234.56);
  assert.equal(txn.type, 'debit', 'type is lowercased');
});

test('normalizeTransactions: collapses whitespace in descriptions', () => {
  const [txn] = normalizeTransactions([
    { date: '2026-04-05', description: '  UPI\t\tTO   MERCHANT \n', amount: 10, type: 'debit' },
  ]);

  assert.equal(txn.description, 'UPI TO MERCHANT');
});

test('normalizeTransactions: truncates descriptions to the column width (255)', () => {
  const [txn] = normalizeTransactions([
    { date: '2026-04-05', description: 'X'.repeat(400), amount: 10, type: 'debit' },
  ]);

  assert.equal(
    txn.description.length,
    255,
    'description must fit VARCHAR(255) or the INSERT throws',
  );
});

test('normalizeTransactions: rejects rows that are not real transactions', () => {
  const rejected = [
    {
      name: 'invalid date',
      row: { date: 'not-a-date', description: 'X', amount: 10, type: 'debit' },
    },
    {
      name: 'zero amount',
      row: { date: '2026-04-05', description: 'X', amount: 0, type: 'debit' },
    },
    {
      name: 'non-numeric amount',
      row: { date: '2026-04-05', description: 'X', amount: 'abc', type: 'debit' },
    },
    {
      name: 'empty description',
      row: { date: '2026-04-05', description: '   ', amount: 10, type: 'debit' },
    },
    { name: 'missing description', row: { date: '2026-04-05', amount: 10, type: 'debit' } },
    {
      name: 'unknown type',
      row: { date: '2026-04-05', description: 'X', amount: 10, type: 'transfer' },
    },
    { name: 'missing type', row: { date: '2026-04-05', description: 'X', amount: 10 } },
  ];

  for (const { name, row } of rejected) {
    assert.deepEqual(normalizeTransactions([row]), [], `should reject: ${name}`);
  }
});

test('normalizeTransactions: drops bad rows but keeps good ones in the same batch', () => {
  const result = normalizeTransactions([
    { date: '2026-04-05', description: 'GOOD ONE', amount: 100, type: 'debit' },
    { date: 'garbage', description: 'BAD ONE', amount: 100, type: 'debit' },
    { date: '2026-04-07', description: 'GOOD TWO', amount: 200, type: 'credit' },
  ]);

  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((t) => t.description),
    ['GOOD ONE', 'GOOD TWO'],
  );
});

test('normalizeTransactions: handles an empty batch', () => {
  assert.deepEqual(normalizeTransactions([]), []);
});

test('normalizeBankName: trims, collapses whitespace, and falls back', () => {
  assert.equal(normalizeBankName('  ICICI   Bank  '), 'ICICI Bank');
  assert.equal(normalizeBankName(''), 'Unknown Bank');
  assert.equal(normalizeBankName('   '), 'Unknown Bank');
  assert.equal(normalizeBankName(null), 'Unknown Bank');
  assert.equal(normalizeBankName(undefined), 'Unknown Bank');
  assert.equal(normalizeBankName(12345), 'Unknown Bank');
});
