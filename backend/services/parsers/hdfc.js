const pdfplumber = require('pdfplumber');

async function parseHDFC(filePath) {
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

          const [dateStr, description, withdrawalStr, depositStr, balanceStr] = row;

          if (!dateStr || (!withdrawalStr && !depositStr)) continue;

          const withdrawal = parseFloat(withdrawalStr || 0);
          const deposit = parseFloat(depositStr || 0);
          const amount = withdrawal || deposit;
          const type = withdrawal ? 'debit' : 'credit';

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
    throw new Error(`HDFC parsing failed: ${err.message}`);
  }
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const formats = [
    /(\d{2})-([A-Za-z]{3})-(\d{4})/, // DD-MMM-YYYY
    /(\d{2})\/(\d{2})\/(\d{4})/,     // DD/MM/YYYY
    /(\d{4})-(\d{2})-(\d{2})/,       // YYYY-MM-DD
  ];

  const dateString = String(dateStr);
  const monthMap = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };

  for (const format of formats) {
    const match = dateString.match(format);
    if (match) {
      if (match[2] && monthMap.hasOwnProperty(match[2].toLowerCase())) {
        return new Date(match[3], monthMap[match[2].toLowerCase()], match[1]);
      } else if (!isNaN(match[2])) {
        return new Date(match[3], match[2] - 1, match[1]);
      }
    }
  }

  return null;
}

module.exports = { parseHDFC };
