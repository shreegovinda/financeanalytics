// Test with exact format the parser expects

const PDFParse = require('pdf-parse');
const fs = require('fs');

// Sample ICICI text in the format a real PDF extraction would have
const iciciText = `ICICI BANK LIMITED
STATEMENT OF ACCOUNT

Date        Narration                           Debit       Credit      
01/04/2026 Opening Balance 0 100000.00
05/04/2026 Salary Credit 50000.00 0
07/04/2026 AMAZON 2500.00 0
10/04/2026 SWIGGY 800.00 0
15/04/2026 ELECTRICITY 1200.00 0
20/04/2026 ATM 5000.00 0`;

function parseDate(dateStr) {
  const match = String(dateStr).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
  }
  return new Date();
}

function parseICICILogic(text) {
  const transactions = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);

    if (dateMatch) {
      const dateStr = dateMatch[1];
      // Extract description (everything before date)
      const descEnd = line.indexOf(dateStr);
      const description = line.substring(0, descEnd).trim();

      // Extract numbers after date
      const afterDate = line.substring(descEnd + dateStr.length).trim();
      const numbers = afterDate.match(/\d+\.?\d*/g) || [];

      if (numbers.length >= 2) {
        const debit = parseFloat(numbers[0]);
        const credit = parseFloat(numbers[1]);

        if (debit > 0 || credit > 0) {
          const amount = debit > 0 ? debit : credit;
          const type = debit > 0 ? 'debit' : 'credit';

          transactions.push({
            date: parseDate(dateStr),
            description: description || 'Transaction',
            amount: amount,
            type: type,
          });
        }
      }
    }
  }

  return transactions;
}

console.log('Testing ICICI parser with proper format:\n');
const results = parseICICILogic(iciciText);
console.log(`Extracted ${results.length} transactions:\n`);
results.forEach((txn, i) => {
  console.log(
    `${i + 1}. ${txn.date.toISOString().split('T')[0]} | ${txn.description.padEnd(25)} | ${txn.type} | ₹${txn.amount.toFixed(2)}`,
  );
});

if (results.length === 6) {
  console.log('\n✓ Parser correctly extracted expected 6 transactions');
} else {
  console.log(`\n⚠ Expected 6 transactions but got ${results.length}`);
}
