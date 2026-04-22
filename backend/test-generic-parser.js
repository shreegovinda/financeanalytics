const { parseStatement } = require('./services/parsers/generic');

async function test() {
  try {
    console.log('Testing generic parser with Excel file...');
    const transactions = await parseStatement('/tmp/sample-statement.xlsx');
    console.log(`✓ Successfully parsed ${transactions.length} transactions:`);
    console.log(JSON.stringify(transactions, null, 2));
  } catch (err) {
    console.error('✗ Parser error:', err.message);
    console.error(err);
  }
}

test();
