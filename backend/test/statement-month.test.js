const test = require('node:test');
const assert = require('node:assert/strict');
const { validateTransactionMonth } = require('../services/statementDates');
const { catalogue, findBank } = require('../services/bankCatalogue');
test('month validation accepts inclusive boundaries and leap day', () => {
  validateTransactionMonth([{ date: '2024-02-01' }, { date: '2024-02-29' }], '2024-02');
});
for (const date of [
  '2026-01-31',
  '2026-03-01',
  '2025-02-10',
  '2026-02-29',
  '2026-02-30',
  'invalid',
  null,
  '2026-02-10T23:00:00-05:00',
]) {
  test('month validation rejects ' + date, () =>
    assert.throws(() => validateTransactionMonth([{ date: '2026-02-01' }, { date }], '2026-02')),
  );
}
test('catalogue has unique permanent IDs and canonical aliases', () => {
  assert.equal(new Set(catalogue.banks.map((b) => b.id)).size, catalogue.banks.length);
  assert.equal(findBank('ICICI Bank Ltd.').id, 'ICICI');
  assert.equal(findBank('State Bank of India').id, findBank('SBI').id);
  assert.equal(findBank('unlisted made up bank'), undefined);
});
