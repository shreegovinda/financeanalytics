function buildTransactionImportQuery(transactions, { statementId, userId }) {
  const values = [];
  const placeholders = transactions.map((txn, index) => {
    const offset = index * 7;
    values.push(userId, statementId, index, txn.date, txn.amount, txn.description, txn.type);
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
  });

  return {
    text: `INSERT INTO transactions (user_id, statement_id, statement_row_index, date, amount, description, type)
           VALUES ${placeholders.join(', ')}
           ON CONFLICT (statement_id, statement_row_index)
           DO UPDATE SET
             statement_row_index = EXCLUDED.statement_row_index
           RETURNING id`,
    values,
  };
}

module.exports = {
  buildTransactionImportQuery,
};
