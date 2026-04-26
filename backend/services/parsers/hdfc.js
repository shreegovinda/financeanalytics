const fs = require('fs');
const PDFParse = require('pdf-parse');

async function parseHDFC(filePath) {
  const transactions = [];

  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await PDFParse(dataBuffer);
    const text = data.text;

    const lines = text.split('\n');
    for (const line of lines) {
      const dateMatch = line.match(/(\d{2})-([A-Za-z]{3})-(\d{4})/);
      if (dateMatch) {
        const dateStr = dateMatch[0];
        const description = line.substring(0, line.indexOf(dateStr)).trim();
        const amountStr = line.substring(line.indexOf(dateStr) + dateStr.length).trim();

        const withdrawMatch = amountStr.match(/^(\d+\.?\d*)\s/);
        const depositMatch = amountStr.match(/\s(\d+\.?\d*)\s*$/);

        if (withdrawMatch || depositMatch) {
          const amount = parseFloat(
            withdrawMatch ? withdrawMatch[1] : depositMatch ? depositMatch[1] : 0,
          );
          const type = withdrawMatch ? 'debit' : 'credit';

          transactions.push({
            date: parseDate(dateStr),
            description: description || 'HDFC Transaction',
            amount: Math.abs(amount),
            type,
          });
        }
      }
    }

    return transactions;
  } catch (err) {
    throw new Error(`HDFC parsing failed: ${err.message}`);
  }
}

function parseDate(dateStr) {
  const monthMap = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };

  const match = String(dateStr).match(/(\d{2})-([A-Za-z]{3})-(\d{4})/);
  if (match) {
    return new Date(parseInt(match[3]), monthMap[match[2].toLowerCase()], parseInt(match[1]));
  }
  return new Date();
}

module.exports = { parseHDFC };
