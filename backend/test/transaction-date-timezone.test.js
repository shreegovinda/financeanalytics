const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');

// transactions.date is a Postgres DATE column. node-pg serializes a JS Date to
// a DATE using its LOCAL calendar components, so the calendar day that lands in
// the database depends on the server's TZ. These tests pin that behaviour down,
// because a one-day drift silently misfiles transactions across month
// boundaries and corrupts every monthly analytics bucket.

const pad = (n) => String(n).padStart(2, '0');

/**
 * Runs normalizeTransactions in a child process under a fixed TZ and returns
 * the calendar day that node-pg would write to the DATE column.
 */
function storedDateUnderTZ(timeZone, isoDate) {
  const script = `
    const { normalizeTransactions } = require(${JSON.stringify(
      path.join(__dirname, '..', 'services', 'parsers', 'generic.js'),
    )});
    const [txn] = normalizeTransactions([
      { date: ${JSON.stringify(isoDate)}, description: 'TEST', amount: 100, type: 'debit' },
    ]);
    const pad = (n) => String(n).padStart(2, '0');
    const d = txn.date;
    process.stdout.write(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()));
  `;

  return execFileSync(process.execPath, ['-e', script], {
    env: { ...process.env, TZ: timeZone },
    encoding: 'utf8',
  });
}

test('date parsing is stable in IST and UTC', () => {
  assert.equal(storedDateUnderTZ('Asia/Kolkata', '2026-04-05'), '2026-04-05');
  assert.equal(storedDateUnderTZ('UTC', '2026-04-05'), '2026-04-05');
});

test('normalizeTransactions parses YYYY-MM-DD as UTC midnight', () => {
  const [txn] = normalizeTransactionsLocal('2026-04-05');
  assert.equal(
    txn.date.toISOString(),
    '2026-04-05T00:00:00.000Z',
    'ISO date-only strings are parsed as UTC midnight, not local midnight',
  );
});

function normalizeTransactionsLocal(isoDate) {
  const { normalizeTransactions } = require('../services/parsers/generic');
  return normalizeTransactions([
    { date: isoDate, description: 'TEST', amount: 100, type: 'debit' },
  ]);
}

// KNOWN BUG — see SECURITY_AND_QUALITY_AUDIT.md.
// A statement dated 2026-04-05 is stored as 2026-04-04 when the server runs in
// any timezone behind UTC. On the 1st of a month this pushes the transaction
// into the previous month and silently skews /api/analytics/bar and /trends.
// Fix: build the Date from local components, or pass the 'YYYY-MM-DD' string
// straight through to Postgres instead of a JS Date.
test.todo('transaction dates should not shift in timezones behind UTC', () => {
  assert.equal(
    storedDateUnderTZ('America/New_York', '2026-04-05'),
    '2026-04-05',
    'currently returns 2026-04-04 — the date drifts one day back',
  );
});

test('the one-day drift is real and reproducible (documents current behaviour)', () => {
  assert.equal(
    storedDateUnderTZ('America/New_York', '2026-04-05'),
    '2026-04-04',
    'if this ever fails, the timezone bug has been fixed — delete this test and ' +
      'un-todo the one above',
  );
});

test('month-boundary drift moves a transaction into the previous month', () => {
  // The damaging case: the 1st of a month becomes the last day of the previous
  // month, so DATE_TRUNC('month', date) buckets it into the wrong month.
  const stored = storedDateUnderTZ('America/New_York', '2026-04-01');
  assert.equal(stored, '2026-03-31');
  assert.notEqual(
    stored.slice(0, 7),
    '2026-04',
    'April transaction is bucketed into March by monthly analytics',
  );
});

test('pad helper produces zero-padded components', () => {
  assert.equal(pad(4), '04');
  assert.equal(pad(12), '12');
});
