const fs = require('fs');
const PDFParse = require('pdf-parse');
const xlsx = require('xlsx');
const {
  generateJsonObject,
  getProviderConfig,
  isProviderConfigured,
  normalizeProviderId,
} = require('../ai');

const STATEMENT_PARSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    bankName: { type: 'STRING' },
    statementMonth: { type: 'STRING' },
    transactions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          date: { type: 'STRING' },
          description: { type: 'STRING' },
          amount: { type: 'NUMBER' },
          type: { type: 'STRING', enum: ['debit', 'credit'] },
        },
        required: ['date', 'description', 'amount', 'type'],
      },
    },
  },
  required: ['bankName', 'statementMonth', 'transactions'],
};

/**
 * Extract text from PDF or Excel file
 */
async function extractTextFromFile(filePath) {
  const ext = filePath.toLowerCase().split('.').pop();

  if (ext === 'pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await PDFParse(dataBuffer);
    return data.text;
  } else if (ext === 'xlsx' || ext === 'xls') {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const csv = xlsx.utils.sheet_to_csv(sheet);
    return csv;
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

/**
 * Use the selected AI provider to parse any bank statement format
 */
async function parseWithAI(fileText, providerId, context = {}) {
  const provider = normalizeProviderId(providerId);
  const expectedBank = context.expectedBank
    ? `Expected selected bank: ${context.expectedBank}.`
    : '';
  const expectedMonth = context.expectedMonth
    ? `Expected selected statement month: ${context.expectedMonth}.`
    : '';
  const expectedFormat = context.expectedFormat
    ? `Expected selected file format: ${context.expectedFormat}.`
    : '';
  const prompt = `You are a production-grade Indian bank statement parser for a personal finance app.

Your task:
1. Detect the bank or issuer name from the statement text.
2. Detect the statement month as YYYY-MM from the statement period and transaction dates.
3. Extract only real posted transactions.
4. Ignore opening balance, closing balance, available balance, page totals, summaries, headers, footers, and duplicate repeated table headers.
5. Preserve transaction descriptions as written, but remove excessive whitespace.
6. Use positive numeric amounts. Put direction in "type": "debit" or "credit".
7. Convert all dates to YYYY-MM-DD. Infer the year from the statement period when needed.
8. If a row is ambiguous and cannot be trusted as a real transaction, skip it.

Selected upload metadata:
${expectedBank}
${expectedMonth}
${expectedFormat}

Do not change the detected bank or statement month to match the selected metadata. Return what the statement actually contains so the server can validate it strictly.

Bank Statement Text:
${fileText}

Respond ONLY with one valid JSON object in this exact shape:
{
  "bankName": "Detected Bank Name",
  "statementMonth": "YYYY-MM",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "transaction description",
      "amount": 1000.00,
      "type": "debit"
    }
  ]
}
Extract every trustworthy posted transaction.`;

  if (!isProviderConfigured(provider)) {
    throw new Error(`${getProviderConfig(provider).label} is not configured`);
  }

  try {
    const parsed = await generateJsonObject(prompt, {
      providerId: provider,
      maxTokens: 32768,
      responseSchema: STATEMENT_PARSE_SCHEMA,
    });
    const transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];

    return {
      bankName: normalizeBankName(parsed.bankName),
      statementMonth: normalizeStatementMonth(parsed.statementMonth, transactions),
      transactions: normalizeTransactions(transactions),
    };
  } catch (err) {
    console.error(`${getProviderConfig(provider).label} parsing error:`, err.message);
    throw err;
  }
}

function normalizeBankName(bankName) {
  const normalized = typeof bankName === 'string' ? bankName.trim().replace(/\s+/g, ' ') : '';
  return normalized || 'Unknown Bank';
}

function normalizeStatementMonth(statementMonth, transactions = []) {
  const normalized = typeof statementMonth === 'string' ? statementMonth.trim() : '';
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(normalized)) {
    return normalized;
  }

  const firstValidDate = transactions
    .map((transaction) => new Date(transaction.date))
    .find((date) => !Number.isNaN(date.getTime()));

  if (!firstValidDate) {
    return '';
  }

  return firstValidDate.toISOString().slice(0, 7);
}

function normalizeTransactions(transactions) {
  return transactions
    .map((transaction) => {
      const date = new Date(transaction.date);
      const amount = Math.abs(parseFloat(transaction.amount));
      const type = String(transaction.type || '').toLowerCase();
      const description =
        typeof transaction.description === 'string'
          ? transaction.description.trim().replace(/\s+/g, ' ')
          : '';

      if (
        Number.isNaN(date.getTime()) ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        !description ||
        !['debit', 'credit'].includes(type)
      ) {
        return null;
      }

      const normalized = {
        date,
        description: description.slice(0, 255),
        amount,
        type,
      };
      return normalized;
    })
    .filter(Boolean);
}

/**
 * Generic parser - works with any bank statement (PDF or Excel)
 */
async function parseStatement(filePath, providerId, context = {}) {
  try {
    console.log(`📄 Extracting text from file: ${filePath}`);
    const fileText = await extractTextFromFile(filePath);

    const provider = normalizeProviderId(providerId);
    console.log(`🔍 Parsing transactions with ${getProviderConfig(provider).label}...`);
    const parsed = await parseWithAI(fileText, provider, context);

    if (parsed.transactions.length === 0) {
      throw new Error('No valid transactions found in the uploaded statement');
    }

    console.log(
      `✓ Successfully parsed ${parsed.transactions.length} transactions from ${parsed.bankName}`,
    );
    return parsed;
  } catch (err) {
    throw new Error(`Statement parsing failed: ${err.message}`);
  }
}

module.exports = {
  parseStatement,
};
