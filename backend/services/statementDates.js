const UploadValidationError = require('./uploadValidationError');
function validateTransactionMonth(transactions, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new UploadValidationError('Invalid statement month');
  for (const [index, transaction] of transactions.entries()) {
    const value =
      transaction.date instanceof Date && !Number.isNaN(transaction.date.getTime())
        ? transaction.date.toISOString().slice(0, 10)
        : transaction.date;
    const date =
      typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(value + 'T00:00:00Z')
        : null;
    if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new UploadValidationError(
        `Transaction ${index + 1} has an invalid calendar date. Nothing was imported.`,
      );
    }
    if (value.slice(0, 7) !== month)
      throw new UploadValidationError(
        `Transaction ${index + 1} is dated ${value}, outside ${month}. Nothing was imported.`,
      );
  }
}
module.exports = { validateTransactionMonth };
