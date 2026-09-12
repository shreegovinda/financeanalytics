const catalogue = require('../data/indian-banks.json');
const normalize = (name) =>
  String(name)
    .toUpperCase()
    .replace(/\b(BANK|LIMITED|LTD)\b/g, '')
    .replace(/[^A-Z0-9]/g, '');
function findBank(value) {
  return catalogue.banks.find((bank) =>
    [bank.id, bank.name, ...bank.aliases].some((name) => normalize(name) === normalize(value)),
  );
}
async function syncCatalogue(pool) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const bank of catalogue.banks) {
      await client.query(
        'INSERT INTO bank_catalogue (id,name,category,active) VALUES ($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,active=EXCLUDED.active',
        [bank.id, bank.name, bank.category, bank.active],
      );
    }
    const legacy = await client.query(
      'SELECT id,bank_code FROM user_bank_accounts WHERE catalogue_id IS NULL',
    );
    for (const account of legacy.rows) {
      const bank = findBank(account.bank_code);
      if (bank)
        await client.query('UPDATE user_bank_accounts SET catalogue_id=$1 WHERE id=$2', [
          bank.id,
          account.id,
        ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
module.exports = { catalogue, findBank, syncCatalogue };
