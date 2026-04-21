const pdfplumber = require('pdfplumber');

async function parseICICI(filePath) {
  const transactions = [];

  try {
    const pdf = await pdfplumber.open(filePath);

    for (let i = 0; i < pdf.page_count; i++) {
      const page = pdf.get_page(i + 1);
      const tables = await page.extract_tables();

      if (!tables || tables.length === 0) continue;

      for (const table of tables) {
        for (let j = 1; j < table.length; j++) {
          const row = table[j];
          if (!row || row.length < 4) continue;

          const [dateStr, description, debit, credit, balance] = row;

          if (!dateStr || (!debit && !credit)) continue;

          const amount = parseFloat(debit || credit || 0);
          const type = debit ? 'debit' : 'credit';

          transactions.push({
            date: parseDate(dateStr),
            description: String(description || '').trim(),
            amount: Math.abs(amount),
            type,
          });
        }
      }
    }

    pdf.close();
    return transactions;
  } catch (err) {
    throw new Error(`ICICI parsing failed: ${err.message}`);
  }
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const formats = [
    /(\d{2})\/(\d{2})\/(\d{4})/, // DD/MM/YYYY
    /(\d{4})-(\d{2})-(\d{2})/,   // YYYY-MM-DD
  ];

  for (const format of formats) {
    const match = String(dateStr).match(format);
    if (match) {
      if (match[0].includes('-')) {
        return new Date(match[1], match[2] - 1, match[3]);
      } else {
        return new Date(match[3], match[2] - 1, match[1]);
      }
    }
  }

  return null;
}

module.exports = { parseICICI };
