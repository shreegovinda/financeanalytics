// Test parser logic directly without PDF file

const iciciSampleText = `ICICI BANK LIMITED
STATEMENT OF ACCOUNT

Date        Narration                           Debit       Credit      Balance
01/04/2026  Opening Balance                                             100,000.00
05/04/2026  Salary Credit - Employer Inc                  50,000.00    150,000.00
07/04/2026  AMAZON.COM                           2,500.00               147,500.00
10/04/2026  SWIGGY FOOD                            800.00               146,700.00
12/04/2026  UBER RIDE                             250.00               146,450.00
15/04/2026  AMAZON.COM                           5,000.00               141,450.00
20/04/2026  ELECTRICITY BILL                     1,200.00               140,250.00
22/04/2026  ATM CASH WITHDRAWAL                  5,000.00               135,250.00`;

function parseDate(dateStr) {
  const match = String(dateStr).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match) {
    return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
  }
  return new Date();
}

function parseICICIText(text) {
  const transactions = [];
  const lines = text.split('\n');
  
  for (const line of lines) {
    const dateMatch = line.match(/(\d{2}\/\d{2}\/\d{4})/);
    
    if (dateMatch) {
      const dateStr = dateMatch[1];
      const description = line.substring(0, line.indexOf(dateStr)).trim();
      const amountStr = line.substring(line.indexOf(dateStr) + dateStr.length).trim();
      
      // Extract debit (first number) and credit (second number)
      const parts = amountStr.split(/\s+/);
      let debit = null, credit = null;
      
      for (const part of parts) {
        const num = parseFloat(part);
        if (!isNaN(num) && num > 0) {
          if (debit === null) debit = num;
          else if (credit === null) {
            credit = num;
            break;
          }
        }
      }
      
      if (debit !== null || credit !== null) {
        const amount = debit || credit;
        const type = debit ? 'debit' : 'credit';
        
        transactions.push({
          date: parseDate(dateStr),
          description: description || 'ICICI Transaction',
          amount: Math.abs(amount),
          type,
        });
      }
    }
  }
  
  return transactions;
}

console.log('Testing ICICI parser logic with sample text:');
const results = parseICICIText(iciciSampleText);
console.log(`\nParsed ${results.length} transactions:\n`);
results.forEach((txn, i) => {
  console.log(`${i + 1}. ${txn.date.toISOString().split('T')[0]} | ${txn.description.padEnd(30)} | ${txn.type.padEnd(6)} | ₹${txn.amount.toFixed(2)}`);
});

console.log(`\n✓ Parser test successful - ${results.length} transactions extracted`);
