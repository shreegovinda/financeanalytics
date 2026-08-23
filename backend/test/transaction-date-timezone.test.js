const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');

// transactions.date is a Postgres DATE column. Before #31 the import passed a JS
// Date straight to node-pg, which serializes using the server's LOCAL calendar
// components — so a statement dated 2026-04-01 was stored as 2026-03-31 on any
// server west of UTC, pushing the transaction into the previous month and
// skewing every monthly analytics bucket.
//
// #31 replaced that with toSqlDate(), which formats via toISOString() in UTC and
// therefore round-trips the same day the AI reported, in any timezone. These
// tests pin that down so the drift cannot come back.

/**
 * Runs the real import date path in a child process under a fixed TZ, returning
 * the calendar day that would be written to the DATE column.
 */
function storedDateUnderTZ(timeZone, isoDate) {
  const script = `
    const { normalizeTransactions } = require(${JSON.stringify(
      path.join(__dirname, '..', 'services', 'parsers', 'generic.js'),
    )});
    const uploadRouter = require(${JSON.stringify(
      path.join(__dirname, '..', 'routes', 'upload.js'),
    )});
    const [txn] = normalizeTransactions([
      { date: ${JSON.stringify(isoDate)}, description: 'TEST', amount: 100, type: 'debit' },
    ]);
    process.stdout.write(uploadRouter.toSqlDate(txn.date));
  `;

  const out = execFileSync(process.execPath, ['-e', script], {
    env: { ...process.env, TZ: timeZone, DOTENV_CONFIG_QUIET: 'true' },
    encoding: 'utf8',
  });

  // Loading the upload router pulls in config/db, whose dotenv call prints a
  // banner to stdout. The date is the final line.
  return out.trim().split('\n').pop().trim();
}

const ZONES = [
  'UTC',
  'Asia/Kolkata', // +05:30, where this app is developed
  'America/New_York', // -04:00/-05:00, where the drift used to appear
  'Pacific/Honolulu', // -10:00, the largest common negative offset
  'Pacific/Kiritimati', // +14:00, the largest positive offset
];

test('transaction dates do not shift in any timezone', () => {
  for (const zone of ZONES) {
    assert.equal(
      storedDateUnderTZ(zone, '2026-04-05'),
      '2026-04-05',
      `date drifted under TZ=${zone}`,
    );
  }
});

test('the first of a month stays in that month', () => {
  // The damaging case: if this drifts back a day it lands in the previous month
  // and DATE_TRUNC('month', date) files it under the wrong month in
  // /api/analytics/bar and /trends.
  for (const zone of ZONES) {
    const stored = storedDateUnderTZ(zone, '2026-04-01');
    assert.equal(stored, '2026-04-01', `month-boundary drift under TZ=${zone}`);
    assert.equal(stored.slice(0, 7), '2026-04', `bucketed into the wrong month under TZ=${zone}`);
  }
});

test('the last of a month stays in that month', () => {
  for (const zone of ZONES) {
    const stored = storedDateUnderTZ(zone, '2026-03-31');
    assert.equal(stored, '2026-03-31', `month-end drift under TZ=${zone}`);
  }
});

test('leap day survives the round trip', () => {
  for (const zone of ZONES) {
    assert.equal(
      storedDateUnderTZ(zone, '2028-02-29'),
      '2028-02-29',
      `leap day lost under ${zone}`,
    );
  }
});

test('toSqlDate accepts both Date objects and ISO strings', () => {
  const uploadRouter = require('../routes/upload');

  assert.equal(uploadRouter.toSqlDate(new Date('2026-04-05T00:00:00.000Z')), '2026-04-05');
  assert.equal(uploadRouter.toSqlDate('2026-04-05'), '2026-04-05');
});

test('toSqlDate rejects an unparseable date rather than storing garbage', () => {
  const uploadRouter = require('../routes/upload');

  assert.throws(
    () => uploadRouter.toSqlDate('not-a-date'),
    /invalid transaction date/i,
    'an unparseable date must fail the upload, not silently become NaN',
  );
});
