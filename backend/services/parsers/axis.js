const XLSX = require('xlsx');

function parseAxis(filePath) {
  const transactions = [];

  try {
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    for (const row of rows) {
      const dateStr = row['Date'] || row['date'] || row['DATE'];
      const description = row['Description'] || row['description'] || row['DESCRIPTION'] || row['Narration'];
      const debit = parseFloat(row['Debit'] || row['debit'] || row['DEBIT'] || 0);
      const credit = parseFloat(row['Credit'] || row['credit'] || row['CREDIT'] || 0);

      if (!dateStr || (!debit && !credit)) continue;

      const amount = debit || credit;
      const type = debit ? 'debit' : 'credit';

      transactions.push({
        date: parseDate(dateStr),
        description: String(description || '').trim(),
        amount: Math.abs(amount),
        type,
      });
    }

    return transactions;
  } catch (err) {
    throw new Error(`Axis parsing failed: ${err.message}`);
  }
}

function parseDate(dateStr) {
  if (!dateStr) return null;

  let date;
  if (typeof dateStr === 'number') {
    date = new Date((dateStr - 25569) * 86400 * 1000);
  } else {
    const formats = [
      /(\d{2})\/(\d{2})\/(\d{4})/,     // DD/MM/YYYY
      /(\d{4})-(\d{2})-(\d{2})/,       // YYYY-MM-DD
      /(\d{2})-([A-Za-z]{3})-(\d{4})/, // DD-MMM-YYYY
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
          date = new Date(match[3], monthMap[match[2].toLowerCase()], match[1]);
          break;
        } else if (!isNaN(match[2])) {
          date = new Date(match[3], match[2] - 1, match[1]);
          break;
        }
      }
    }
  }

  return date && !isNaN(date) ? date : null;
}

module.exports = { parseAxis };
