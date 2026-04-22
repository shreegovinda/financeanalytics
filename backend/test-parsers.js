// Quick validation of parser installations
try {
  const pdf = require('pdf-parse');
  console.log('✓ pdf-parse installed');
} catch (e) {
  console.log('✗ pdf-parse NOT installed:', e.message);
}

try {
  const xlsx = require('xlsx');
  console.log('✓ xlsx installed');
} catch (e) {
  console.log('✗ xlsx NOT installed:', e.message);
}

// Test ICICI parser import
try {
  const iciciParser = require('./services/parsers/icici');
  console.log('✓ ICICI parser imports successfully');
  console.log('  Exports:', Object.keys(iciciParser));
} catch (e) {
  console.log('✗ ICICI parser error:', e.message);
}

// Test HDFC parser import
try {
  const hdfcParser = require('./services/parsers/hdfc');
  console.log('✓ HDFC parser imports successfully');
  console.log('  Exports:', Object.keys(hdfcParser));
} catch (e) {
  console.log('✗ HDFC parser error:', e.message);
}

// Test Axis parser import
try {
  const axisParser = require('./services/parsers/axis');
  console.log('✓ Axis parser imports successfully');
  console.log('  Exports:', Object.keys(axisParser));
} catch (e) {
  console.log('✗ Axis parser error:', e.message);
}

// Test Claude service import
try {
  const claude = require('./services/claude');
  console.log('✓ Claude service imports successfully');
  console.log('  Exports:', Object.keys(claude));
} catch (e) {
  console.log('✗ Claude service error:', e.message);
}
