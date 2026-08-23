const fs = require('fs');
const PDFParse = require('pdf-parse');
const xlsx = require('xlsx');
const {
  generateJsonObject,
  getProviderConfig,
  notConfiguredMessage,
  isProviderConfigured,
  normalizeProviderId,
} = require('../ai');

/**
 * Parses a merchant bill (Blinkit, Swiggy, Amazon, a restaurant receipt) into a
 * merchant, a total, and line items.
 *
 * Mirrors parsers/generic.js, but a bill is a single purchase rather than a
 * ledger: it produces exactly one total that should reconcile against the
 * transaction it is attached to, plus the items making up that total.
 */

const BILL_PARSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchantName: { type: 'STRING' },
    billDate: { type: 'STRING' },
    total: { type: 'NUMBER' },
    lineItems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          description: { type: 'STRING' },
          quantity: { type: 'NUMBER' },
          unitPrice: { type: 'NUMBER' },
          amount: { type: 'NUMBER' },
        },
        required: ['description', 'amount'],
      },
    },
  },
  required: ['merchantName', 'total', 'lineItems'],
};

async function extractTextFromFile(filePath) {
  const ext = filePath.toLowerCase().split('.').pop();

  if (ext === 'pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await PDFParse(dataBuffer);
    return data.text;
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_csv(sheet);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

function normalizeMerchantName(value) {
  const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return (normalized || 'Unknown Merchant').slice(0, 255);
}

function normalizeBillDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // Formatted in UTC to match how transaction dates are stored; see
  // toSqlDate in routes/upload.js.
  return date.toISOString().slice(0, 10);
}

/**
 * Line items are informational detail, not ledger entries, so a malformed row is
 * dropped rather than failing the whole bill.
 */
function normalizeLineItems(lineItems) {
  if (!Array.isArray(lineItems)) return [];

  return lineItems
    .map((item) => {
      const amount = Number.parseFloat(item?.amount);
      const description =
        typeof item?.description === 'string' ? item.description.trim().replace(/\s+/g, ' ') : '';

      if (!description || !Number.isFinite(amount)) {
        return null;
      }

      const quantity = Number.parseFloat(item?.quantity);
      const unitPrice = Number.parseFloat(item?.unitPrice);

      return {
        description: description.slice(0, 500),
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : null,
        unitPrice: Number.isFinite(unitPrice) ? Math.abs(unitPrice) : null,
        amount: Math.abs(amount),
      };
    })
    .filter(Boolean);
}

async function parseBill(filePath, providerId) {
  const provider = normalizeProviderId(providerId);

  if (!isProviderConfigured(provider)) {
    throw new Error(notConfiguredMessage(provider));
  }

  const fileText = await extractTextFromFile(filePath);

  const prompt = `You are extracting a purchase bill or invoice for a personal finance app.

Your task:
1. Identify the merchant or seller name (for example Blinkit, Swiggy, Amazon, Zomato, Ola).
2. Extract the bill or order date.
3. Extract the final total actually charged, after discounts and including taxes,
   delivery, and any other fees.
4. Extract every line item with its description and amount. Include charges such
   as delivery fees and taxes as their own line items when they are listed.
5. Use positive numbers throughout.
6. Convert the date to YYYY-MM-DD.

Bill text:
${fileText}

Respond ONLY with one valid JSON object in this exact shape:
{
  "merchantName": "Merchant name",
  "billDate": "YYYY-MM-DD",
  "total": 450.50,
  "lineItems": [
    { "description": "item name", "quantity": 1, "unitPrice": 200.00, "amount": 200.00 }
  ]
}`;

  try {
    const parsed = await generateJsonObject(prompt, {
      providerId: provider,
      maxTokens: 8192,
      responseSchema: BILL_PARSE_SCHEMA,
    });

    const total = Number.parseFloat(parsed.total);

    return {
      merchantName: normalizeMerchantName(parsed.merchantName),
      billDate: normalizeBillDate(parsed.billDate),
      total: Number.isFinite(total) ? Math.abs(total) : null,
      lineItems: normalizeLineItems(parsed.lineItems),
    };
  } catch (err) {
    console.error(`${getProviderConfig(provider).label} bill parsing error:`, err.message);
    throw new Error(`Bill parsing failed: ${err.message}`);
  }
}

module.exports = {
  parseBill,
  // Exported for unit testing.
  normalizeMerchantName,
  normalizeBillDate,
  normalizeLineItems,
};
