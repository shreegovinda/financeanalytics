# Phase 3.3: Claude AI Integration - Implementation Complete

## Summary

Claude AI auto-categorization has been fully integrated into the backend. Transactions are automatically categorized upon file upload, and a manual categorization endpoint is available for re-categorizing transactions.

## Components Implemented

### 1. Backend Services (`/services/claude.js`)

- **categorizeBatch(transactions)**: Main function that processes transactions in batches of 50
- **categorizeWithRetry(transactions, attempt)**: Implements exponential backoff retry logic (3 retries, 1s initial delay)
- **CATEGORIES**: Predefined list of 10 transaction categories
- **Error Handling**: Automatic retry on API failures, JSON parsing, category validation

### 2. API Endpoints

#### POST `/api/upload`

- Accepts PDF/Excel statements from ICICI, HDFC, or Axis banks
- **Before**: Parses file → inserts transactions → updates status
- **After**: Same + triggers async Claude categorization
- Categorization happens **asynchronously** (non-blocking response)
- Transactions populated with `ai_suggested_category` field

**Example Response:**

```json
{
  "success": true,
  "statementId": "uuid",
  "transactionCount": 45,
  "message": "45 transactions imported from ICICI"
}
```

#### POST `/api/transactions/categorize`

- Manual categorization trigger for uncategorized transactions
- **Request:**

```json
{
  "transactionIds": ["uuid1", "uuid2", ...]
}
```

- **Response:**

```json
{
  "success": true,
  "categorized": 2,
  "message": "2 transactions categorized"
}
```

### 3. Database Integration

- `transactions.ai_suggested_category` field stores Claude's suggestion
- User can override via `PUT /api/transactions/:id` with custom `categoryId`
- Two-level categorization: AI suggestion + user selection

### 4. PDF Parsing Updates

- **ICICI Parser**: Migrated from invalid `pdfplumber` to `pdf-parse`
- **HDFC Parser**: Migrated from invalid `pdfplumber` to `pdf-parse`
- **Axis Parser**: Already uses `xlsx` for Excel parsing (no changes needed)

### 5. Error Handling

- **Missing API Key**: Clear error message directing to https://console.anthropic.com/account/keys
- **API Failures**: Exponential backoff (1s → 2s → 4s) up to 3 retries
- **Invalid Categories**: Defaults to 'Other' if Claude returns unknown category
- **Confidence Scoring**: Returns 0-1 confidence for each categorization

## Setup Requirements

### 1. Set Claude API Key

Update `/backend/.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
```

Get your key from: https://console.anthropic.com/account/keys

### 2. Start Backend Server

```bash
npm run dev
```

### 3. Database

Schema automatically initialized on server start. Ensure PostgreSQL is running:

```bash
psql -U postgres -c "SELECT 1" # test connection
```

## Testing

### Manual Test via curl

```bash
# 1. Upload a bank statement
curl -X POST http://localhost:3001/api/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@statement.pdf" \
  -F "bankName=ICICI"

# 2. Get categorization status (query transactions)
curl http://localhost:3001/api/transactions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# 3. Manually categorize specific transactions
curl -X POST http://localhost:3001/api/transactions/categorize \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"transactionIds": ["txn-uuid-1", "txn-uuid-2"]}'
```

### Integration Test Flow

1. Create user account via `/api/auth/signup`
2. Upload a bank statement PDF/Excel
3. Query `/api/transactions` to see `ai_suggested_category` populated
4. Optionally re-categorize via `/api/transactions/categorize`

## Cost Tracking

- **Per User**: ~$0.126/year for 12 monthly uploads (50 txns each)
- **Batch Size**: 50 transactions per API call (cost + speed optimized)
- **Model**: Claude 3.5 Sonnet ($3/1M input tokens, $15/1M output tokens)

## Next Steps (Phase 3.4)

- Dashboard analytics: Pie chart (spending by category), Bar chart (monthly trends)
- Transaction filtering and sorting UI
- Category-wise breakdown visualization
- See ARCHITECTURE.md for full dashboard design

## Known Limitations

- PDF text extraction is basic (no table structure detection)
- For production, consider more robust PDF parsing libraries
- Requires valid ANTHROPIC_API_KEY for categorization
- Rate limit: 100 requests/min on Claude API

## Files Modified

- ✅ backend/services/claude.js (NEW)
- ✅ backend/routes/upload.js (UPDATED - added categorization)
- ✅ backend/routes/transactions.js (UPDATED - added categorize endpoint)
- ✅ backend/server.js (UPDATED - added db init)
- ✅ backend/services/parsers/icici.js (UPDATED - pdf-parse migration)
- ✅ backend/services/parsers/hdfc.js (UPDATED - pdf-parse migration)
- ✅ backend/.env.local (UPDATED - API key variable name)
- ✅ backend/package.json (UPDATED - pdf-parse dependency)
