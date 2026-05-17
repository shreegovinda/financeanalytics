async function upsertStatementTransactions(client, { userId, statementId, transactions }) {
  await client.query(
    'DELETE FROM transactions WHERE statement_id = $1 AND statement_row_index IS NULL',
    [statementId],
  );

  if (transactions.length === 0) {
    return [];
  }

  const values = [];
  const placeholders = transactions.map((txn, index) => {
    const offset = index * 7;
    values.push(userId, statementId, index, txn.date, txn.amount, txn.description, txn.type);
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
  });

  const result = await client.query(
    `INSERT INTO transactions
       (user_id, statement_id, statement_row_index, date, amount, description, type)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (statement_id, statement_row_index)
       WHERE statement_row_index IS NOT NULL
     DO UPDATE SET
       user_id = EXCLUDED.user_id,
       date = EXCLUDED.date,
       amount = EXCLUDED.amount,
       description = EXCLUDED.description,
       type = EXCLUDED.type
     RETURNING id, statement_row_index`,
    values,
  );

  const txnIds = [];
  for (const row of result.rows) {
    txnIds[Number(row.statement_row_index)] = row.id;
  }

  return txnIds;
}

module.exports = {
  upsertStatementTransactions,
};
