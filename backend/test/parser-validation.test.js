const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xlsx = require('xlsx');
const UploadValidationError = require('../services/uploadValidationError');

test('parser preserves validation errors for HTTP 400 handling without calling a provider', async () => {
  const aiPath = require.resolve('../services/ai');
  const original = require.cache[aiPath];
  require.cache[aiPath] = {
    id: aiPath,
    filename: aiPath,
    loaded: true,
    exports: {
      generateJsonObject: async () => ({
        bankName: 'HDFC Bank',
        statementMonth: '2026-01',
        transactions: [{ date: '2025-01-02', amount: 10, type: 'debit' }],
      }),
      getProviderConfig: () => ({ label: 'Test' }),
      isProviderConfigured: () => true,
      normalizeProviderId: () => 'test',
    },
  };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parser-validation-'));
  try {
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([['Date'], ['2025-01-02']]));
    const file = path.join(directory, 'statement.xlsx');
    xlsx.writeFile(workbook, file);
    const { parseStatement } = require('../services/parsers/generic');
    await assert.rejects(
      parseStatement(file, 'test', { expectedMonth: '2026-01' }),
      (error) => error instanceof UploadValidationError && /outside 2026-01/.test(error.message),
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
    delete require.cache[require.resolve('../services/parsers/generic')];
    if (original) require.cache[aiPath] = original;
    else delete require.cache[aiPath];
  }
});
