const fs = require('fs');
const PDFParse = require('pdf-parse');

async function parseICICI(filePath) {
  const transactions = [];

  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await PDFParse(dataBuffer);
    const text = data.text;

    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);

      if (dateMatch) {
        const dateStr = dateMatch[1];
        const description = line.substring(0, line.indexOf(dateStr)).trim();
        const amountStr = line.substring(line.indexOf(dateStr) + dateStr.length).trim();

        const debitMatch = amountStr.match(/^(\d+\.?\d*)\s/);
        const creditMatch = amountStr.match(/\s(\d+\.?\d*)\s*$/);

        if (debitMatch || creditMatch) {
          const amount = parseFloat(debitMatch ? debitMatch[1] : creditMatch ? creditMatch[1] : 0);
          const type = debitMatch ? 'debit' : 'credit';

          transactions.push({
            date: parseDate(dateStr),
            description: description || 'ICICI Transaction',
            amount: Math.abs(amount),
            type,
          });
        }
      }
      i++;
    }

    return transactions;
  } catch (err) {
    throw new Error(`ICICI parsing failed: ${err.message}`);
  }
}

function parseDate(dateStr) {
  const match = String(dateStr).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
  }
  return new Date();
}

module.exports = { parseICICI };
