function buildTransactionInsertQuery(transactions, userId, statementId) {
  const values = [];
  const placeholders = transactions.map((txn, index) => {
    const offset = index * 7;
    values.push(userId, statementId, txn.date, txn.amount, txn.description, txn.type, index);
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7})`;
  });

  return {
    text: `INSERT INTO transactions
           (user_id, statement_id, date, amount, description, type, statement_row_index)
           VALUES ${placeholders.join(', ')}
           ON CONFLICT (statement_id, statement_row_index)
           WHERE statement_row_index IS NOT NULL
           DO UPDATE SET
             user_id = EXCLUDED.user_id,
             date = EXCLUDED.date,
             amount = EXCLUDED.amount,
             description = EXCLUDED.description,
             type = EXCLUDED.type,
             ai_suggested_category = NULL
           RETURNING id, statement_row_index`,
    values,
  };
}

module.exports = {
  buildTransactionInsertQuery,
};
