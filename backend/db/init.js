const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function initializeDatabase() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schema);
  await require('../services/bankCatalogue').syncCatalogue(pool);
  console.log('✅ Database schema initialized');
}

if (require.main === module) {
  initializeDatabase()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('❌ Database initialization failed:', err.message);
      await pool.end().catch(() => {});
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
