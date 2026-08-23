const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeMerchantName,
  normalizeBillDate,
  normalizeLineItems,
} = require('../services/parsers/bill');
const { buildMismatch } = require('../routes/bills');

// Line items are informational detail hanging off a transaction, never ledger
// entries of their own — so these normalizers are deliberately more forgiving
// than normalizeTransactions, which guards real money.

test('normalizeMerchantName trims, collapses whitespace, and falls back', () => {
  assert.equal(normalizeMerchantName('  Blinkit   Commerce '), 'Blinkit Commerce');
  assert.equal(normalizeMerchantName(''), 'Unknown Merchant');
  assert.equal(normalizeMerchantName('   '), 'Unknown Merchant');
  assert.equal(normalizeMerchantName(null), 'Unknown Merchant');
  assert.equal(normalizeMerchantName(42), 'Unknown Merchant');
});

test('normalizeMerchantName fits the column width', () => {
  assert.equal(normalizeMerchantName('X'.repeat(400)).length, 255);
});

test('normalizeBillDate formats in UTC to match stored transaction dates', () => {
  assert.equal(normalizeBillDate('2026-03-05'), '2026-03-05');
  assert.equal(normalizeBillDate('2026-03-05T18:30:00Z'), '2026-03-05');
});

test('normalizeBillDate returns null rather than an invalid date', () => {
  // A bill with an unreadable date is still worth attaching.
  assert.equal(normalizeBillDate('not-a-date'), null);
  assert.equal(normalizeBillDate(''), null);
  assert.equal(normalizeBillDate(null), null);
  assert.equal(normalizeBillDate(undefined), null);
});

test('normalizeLineItems keeps well-formed rows and normalises numbers', () => {
  const items = normalizeLineItems([
    { description: '  Milk   1L ', quantity: 2, unitPrice: 60, amount: 120 },
    { description: 'Bread', quantity: '1', unitPrice: '45.00', amount: '45' },
  ]);

  assert.equal(items.length, 2);
  assert.deepEqual(items[0], {
    description: 'Milk 1L',
    quantity: 2,
    unitPrice: 60,
    amount: 120,
  });
  assert.equal(items[1].amount, 45, 'numeric strings are accepted');
});

test('normalizeLineItems drops unusable rows instead of failing the bill', () => {
  const items = normalizeLineItems([
    { description: 'Good', amount: 10 },
    { description: '', amount: 10 },
    { description: 'No amount' },
    { description: 'Bad amount', amount: 'abc' },
    null,
    { amount: 10 },
  ]);

  assert.equal(items.length, 1);
  assert.equal(items[0].description, 'Good');
});

test('normalizeLineItems accepts charges with no quantity or unit price', () => {
  // Delivery fees and taxes are listed as bare amounts.
  const [item] = normalizeLineItems([{ description: 'Delivery fee', amount: 35 }]);
  assert.equal(item.quantity, null);
  assert.equal(item.unitPrice, null);
  assert.equal(item.amount, 35);
});

test('normalizeLineItems stores amounts as positive magnitudes', () => {
  const [item] = normalizeLineItems([{ description: 'Refund line', amount: -50 }]);
  assert.equal(item.amount, 50);
});

test('normalizeLineItems handles a non-array', () => {
  assert.deepEqual(normalizeLineItems(null), []);
  assert.deepEqual(normalizeLineItems(undefined), []);
  assert.deepEqual(normalizeLineItems('nope'), []);
});

// A mismatch is surfaced, never blocking: tips, partial refunds, wallet top-ups
// and separately charged delivery all produce legitimate disagreements.

test('buildMismatch is silent when the totals agree', () => {
  const result = buildMismatch({ amount: '450.50' }, 450.5);
  assert.equal(result.mismatch, false);
  assert.equal(result.difference, 0);
});

test('buildMismatch tolerates sub-paisa float drift', () => {
  assert.equal(buildMismatch({ amount: 450.5 }, 450.504).mismatch, false);
});

test('buildMismatch reports the signed difference', () => {
  const over = buildMismatch({ amount: 450.5 }, 520);
  assert.equal(over.mismatch, true);
  assert.equal(over.reason, 'total_differs');
  assert.equal(over.difference, 69.5);
  assert.match(over.message, /520\.00/);
  assert.match(over.message, /450\.50/);

  const under = buildMismatch({ amount: 450.5 }, 400);
  assert.equal(under.difference, -50.5, 'a smaller bill reports a negative difference');
});

test('buildMismatch compares magnitudes, so debit sign does not matter', () => {
  // Debits are stored positive with direction in `type`, but guard anyway.
  assert.equal(buildMismatch({ amount: -450.5 }, 450.5).mismatch, false);
});

test('buildMismatch flags a bill with no readable total', () => {
  const result = buildMismatch({ amount: 450.5 }, null);
  assert.equal(result.mismatch, true);
  assert.equal(result.reason, 'no_total');
});
