// Product knowledge is intentionally curated: do not send repository files,
// environment configuration, or credentials to the model.
module.exports = {
  version: '2026-09-11',
  purpose:
    'Finlytix analyses uploaded Indian bank statements. It has no live connection to bank accounts.',
  banks:
    'Settings lets users search a central catalogue of 80 domestic Indian banks. Cooperative banks are not yet included. Remove only with no statements; otherwise deactivate. Reactivation restores upload availability. Catalogue updates are reviewed manually using RBI sources.',
  imports:
    'Select an active saved bank, year/month and PDF or XLSX (10 MB maximum). AI extracts transactions; review before confirming. One statement per user/bank/month across formats. Invalid dates or any transaction outside the selected month reject the import. Extraction can be imperfect: compare the preview with the original.',
  management:
    'Statements offers preview of extracted transactions, download of retained originals for new uploads, and delete. Older originals were not retained. Deleting cascades to transactions, drafts, attached bills, line items and retained original; totals refresh and the month becomes available again.',
  categories:
    'Settings manages parent categories and subcategories. Transactions supports manual category corrections and AI suggestions. Automatic learning from corrections is not implemented.',
  analytics:
    'Dashboard shows credits as income, debits as expenses, net cash flow and savings rate. Analytics supports date ranges and category, monthly and trend charts. Net cash flow is not a bank balance. Transfers are not automatically reconciled across banks, so they can inflate income/expense. Only imported transactions count; pending review statements do not count.',
  bills:
    'Users can attach merchant bills to transactions and review extracted line items. Bills provide detail; do not add bill amounts to transaction totals again.',
  account:
    'Email/password signup requires email verification. Account profile and password controls are in the dashboard. Credentials, tokens and other users are never available to this assistant.',
  assistant:
    'Read-only financial and product assistant. Can query own transactions, summaries, categories, banks, statement coverage, profile, attached bills and application payment history. Cannot upload, delete, change categories, send messages or execute payments. Chat history is saved to the user account. The user can load older messages or permanently delete saved history using the assistant page controls. Uses the configured AI provider; relevant retrieved data is sent to it.',
  limits:
    'Do not describe planned features as implemented. No refund management, live account balances, automatic bank feeds, guaranteed fraud detection, or investment recommendations. For missing statements, ask for the intended period and compare actual coverage; absence alone does not prove a missing statement.',
};
