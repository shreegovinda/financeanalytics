const xlsx = require('xlsx');

// Create a sample bank statement Excel file
const data = [
  ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
  ['2026-04-05', 'Salary Credit - Employer Inc', '', 50000, 150000],
  ['2026-04-07', 'AMAZON.COM', 2500, '', 147500],
  ['2026-04-10', 'SWIGGY FOOD ORDER', 800, '', 146700],
  ['2026-04-12', 'UBER RIDE', 250, '', 146450],
  ['2026-04-15', 'ELECTRICITY BILL PAYMENT', 1200, '', 145250],
  ['2026-04-20', 'ATM CASH WITHDRAWAL', 5000, '', 140250],
  ['2026-04-22', 'AMAZON.COM', 3000, '', 137250],
];

const ws = xlsx.utils.aoa_to_sheet(data);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, 'Statement');
xlsx.writeFile(wb, '/tmp/sample-statement.xlsx');

console.log('✓ Created /tmp/sample-statement.xlsx');
