const { Pool } = require('pg');
const path = require('path');
const types = require('pg').types;
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// GLOBAL SIDE EFFECT: setTypeParser mutates the shared pg type registry for this
// entire process — every pool/client will return NUMERIC columns as JS numbers.
// Consequence 1: precision loss for very large SUM(amount)::numeric (> 2^53).
// Consequence 2: trailing zeros are dropped ("10.50" → 10.5); callers must use
//   .toFixed(2) when formatting monetary values for display.
// If you need per-query control, prefer explicit SQL casts (::float8) instead.
types.setTypeParser(1700, (val) => parseFloat(val));

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'financeanalytics',
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

module.exports = pool;
