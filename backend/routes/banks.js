const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/auth');
const { catalogue } = require('../services/bankCatalogue');
const router = express.Router();
router.get('/catalogue', auth, async (_req, res) => {
  const result = await pool.query(
    'SELECT id,name,category FROM bank_catalogue WHERE active ORDER BY name',
  );
  res.json({
    banks: result.rows,
    version: catalogue.version,
    source: catalogue.source,
    scope: catalogue.scope,
  });
});
router.get('/', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.id,b.bank_code,b.catalogue_id,COALESCE(c.name,b.bank_code) AS name,
      b.active AND COALESCE(c.active,FALSE) AS active,
      EXISTS(SELECT 1 FROM statements s WHERE s.bank_account_id=b.id) AS has_statements
      FROM user_bank_accounts b LEFT JOIN bank_catalogue c ON c.id=b.catalogue_id
      WHERE b.user_id=$1 ORDER BY name`,
      [req.user.id],
    );
    res.json({
      banks: result.rows,
      selected: result.rows.filter((b) => b.active).map((b) => b.bank_code),
    });
  } catch {
    res.status(500).json({ error: 'Failed to load bank accounts' });
  }
});
router.post('/', auth, async (req, res) => {
  if (typeof req.body.catalogueId !== 'string')
    return res.status(400).json({ error: 'Select a bank from the catalogue' });
  try {
    const result = await pool.query(
      `INSERT INTO user_bank_accounts(user_id,bank_code,catalogue_id)
      SELECT $1,id,id FROM bank_catalogue WHERE id=$2 AND active RETURNING id`,
      [req.user.id, req.body.catalogueId],
    );
    if (!result.rows.length)
      return res.status(400).json({ error: 'Select an available bank from the catalogue' });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res
      .status(err.code === '23505' ? 409 : 500)
      .json({
        error:
          err.code === '23505'
            ? 'This bank is already saved. Reactivate it if needed.'
            : 'Failed to add bank',
      });
  }
});
async function changeBank(req, res, remove) {
  if (!/^[0-9a-f-]{36}$/i.test(req.params.id))
    return res.status(400).json({ error: 'Invalid bank account' });
  if (!remove && typeof req.body.active !== 'boolean')
    return res.status(400).json({ error: 'Choose active or inactive' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, hashtext($2::text))', [
      87421001,
      String(req.user.id),
    ]);
    const account = (
      await client.query(
        'SELECT id,catalogue_id FROM user_bank_accounts WHERE id=$1 AND user_id=$2 FOR UPDATE',
        [req.params.id, req.user.id],
      )
    ).rows[0];
    if (!account) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Bank account not found' });
    }
    if (remove) {
      const attached = await client.query(
        'SELECT 1 FROM statements WHERE bank_account_id=$1 LIMIT 1',
        [account.id],
      );
      if (attached.rows.length) {
        await client.query('ROLLBACK');
        return res
          .status(409)
          .json({ error: 'This bank has statements. Deactivate it to preserve its history.' });
      }
      await client.query('DELETE FROM user_bank_accounts WHERE id=$1', [account.id]);
    } else {
      if (req.body.active) {
        const available = await client.query(
          'SELECT 1 FROM bank_catalogue WHERE id=$1 AND active',
          [account.catalogue_id],
        );
        if (!available.rows.length) {
          await client.query('ROLLBACK');
          return res
            .status(409)
            .json({ error: 'This bank is no longer available in the catalogue' });
        }
      }
      await client.query('UPDATE user_bank_accounts SET active=$1 WHERE id=$2', [
        req.body.active,
        account.id,
      ]);
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to update bank' });
  } finally {
    client.release();
  }
}
router.delete('/:id', auth, (req, res) => changeBank(req, res, true));
router.put('/:id', auth, (req, res) => changeBank(req, res, false));
module.exports = router;
