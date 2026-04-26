const { Pool } = require('pg');
const types = require('pg').types;
require('dotenv').config({ path: '.env.local' });

// Parse numeric/decimal types to JavaScript numbers instead of strings
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
