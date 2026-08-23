# Financial Analytics Application

A personal finance statement analyzer that uses AI to automatically categorize bank transactions and provides comprehensive analytics dashboards.

## Features

- 📤 Upload bank statements (PDF/Excel) from Indian banks (ICICI, SBI)
- 🤖 AI-powered transaction categorization using Claude API
- ✏️ Manual category override for transactions
- 📊 Beautiful analytics dashboards with:
  - Pie charts showing spending breakdown by category
  - Bar charts showing monthly income vs expenses
  - Monthly-wise analysis and trends
- 👤 User authentication with email/password, verified email, and OTP sign-in
- 📱 Responsive design for desktop and mobile

## Tech Stack

### Frontend
- Next.js 14 (React)
- TypeScript
- Tailwind CSS
- Zustand (state management)
- Recharts (charts)
- Axios (HTTP client)

### Backend
- Node.js + Express
- PostgreSQL
- JWT authentication
- Claude API integration
- pdfplumber & xlsx (file parsing)

## Prerequisites

- Node.js v18+
- PostgreSQL installed and running
- Claude API key (from Anthropic)
- Google OAuth credentials (optional, for OAuth login)

## Setup Instructions

### 1. Clone/Setup

```bash
cd financeanalytics
```

### 2. Database Setup

Create PostgreSQL database and run schema:

```bash
psql -U postgres
CREATE DATABASE financeanalytics;
\c financeanalytics
```

Then load the schema (includes idempotent migrations safe for both fresh and existing databases):

```bash
psql -U postgres -d financeanalytics -f backend/db/schema.sql
```

> **Note:** `backend/db/schema.sql` is the canonical schema file and includes all
> migration steps. You do not normally need to run it by hand — `npm run dev`
> applies it automatically on startup via `backend/db/init.js`. Run
> `node backend/db/init.js` to apply it without starting the server.

### 3. Backend Setup

```bash
cd backend
cp .env.example .env.local
# Edit .env.local with your database and API credentials
npm install
npm run dev
```

Server will run on `http://localhost:3001`

### 4. Frontend Setup

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Frontend will run on `http://localhost:3000`

## Project Structure

```
financeanalytics/
├── backend/
│   ├── config/
│   │   └── db.js           # Postgres connection pool
│   ├── db/
│   │   ├── schema.sql      # Canonical schema + idempotent migrations
│   │   └── init.js         # Applies schema.sql on server start
│   ├── routes/             # auth, upload, transactions, categories,
│   │                       # analytics, payments, ai
│   ├── middleware/
│   │   └── auth.js         # JWT verification
│   ├── services/
│   │   ├── ai.js           # Provider abstraction (Claude / Gemini)
│   │   ├── claude.js       # Batch categorization
│   │   ├── otp.js          # OTP generation and email delivery
│   │   ├── payment.js      # Razorpay orders and verification
│   │   └── parsers/
│   │       └── generic.js  # AI-driven PDF/Excel statement parser
│   ├── test/               # node:test suite (npm test)
│   └── server.js           # Express app entry
├── frontend/
│   ├── app/
│   │   ├── auth/           # Combined login / signup / OTP flow
│   │   ├── dashboard/      # Summary widgets and charts
│   │   ├── transactions/   # Transaction table and category editing
│   │   ├── analytics/      # Charts and date-range analysis
│   │   ├── statements/     # Upload history and per-statement detail
│   │   ├── settings/       # Profile and password
│   │   └── pricing/        # Premium features
│   ├── components/         # Reusable components
│   ├── lib/
│   │   ├── api.ts          # API helpers
│   │   ├── store.ts        # Zustand store
│   │   └── date.ts         # Date formatting
│   └── public/             # Static assets
└── README.md
```

> `backend/services/parsers/{icici,hdfc,axis}.js` are superseded by the generic
> AI parser and are no longer referenced by any route.

## API Endpoints

All routes except those marked *public* require an
`Authorization: Bearer <token>` header.

### Authentication
- `POST /api/auth/register` - Register new user; sends a verification email and issues **no** session until the address is confirmed *(public)*
- `POST /api/auth/verify-email` - Confirm a signup with the emailed 6-digit code *(public)*
- `POST /api/auth/verify-email/token` - Confirm a signup with the magic-link token *(public)*
- `POST /api/auth/resend-verification` - Reissue the verification link and code *(public)*
- `POST /api/auth/login` - Login with email and password *(public)*
- `POST /api/auth/check-email` - Check whether an email is registered *(public)*
- `POST /api/auth/send-otp` - Email a login OTP *(public)*
- `POST /api/auth/verify-otp` - Exchange an OTP for a token *(public)*
- `POST /api/auth/forgot-password/send-otp` - Email a reset OTP *(public)*
- `POST /api/auth/forgot-password/reset` - Reset password with an OTP *(public)*
- `GET /api/auth/me` - Current user profile
- `PUT /api/auth/me` - Update name and phone
- `PUT /api/auth/password` - Change password

### Statements
- `POST /api/upload` - Upload a statement. Requires `bank`, `statementMonth`, and
  `fileFormat` alongside the file; rejects with 400 if the parsed content does
  not match, and 409 if another statement is still processing. On success the
  transactions are imported synchronously and 202 is returned while
  categorization continues in the background.
- `GET /api/upload` - List uploaded statements with processing status
- `GET /api/upload/:statementId` - Statement detail plus its transactions
- `DELETE /api/upload/:statementId` - Delete a statement and its transactions

### Transactions
- `GET /api/transactions` - List transactions (`startDate`, `endDate`, `categoryId`, `limit`, `offset`)
- `GET /api/transactions/:id` - Single transaction
- `PUT /api/transactions/:id` - Update category or description
- `GET /api/transactions/stats/summary` - Income, expense, and count totals
- `POST /api/transactions/categorize` - Run AI categorization over given ids

### Categories
- `GET /api/categories` - List categories (defaults are seeded per user)
- `POST /api/categories` - Create a category
- `PUT /api/categories/:id` - Rename or recolour a category
- `DELETE /api/categories/:id` - Delete a category
- `POST /api/categories/bulk-reassign` - Move transactions between categories

### Analytics
All three accept optional validated `startDate` / `endDate` query parameters.
- `GET /api/analytics/pie` - Spending by category
- `GET /api/analytics/bar` - Monthly income vs expenses
- `GET /api/analytics/trends` - Month-over-month analysis

### Payments
- `GET /api/payments/pricing` - Premium feature catalogue *(public)*
- `POST /api/payments/create-order` - Create a Razorpay order
- `POST /api/payments/verify` - Verify a completed payment
- `GET /api/payments/history` - Payment history
- `GET /api/payments/check/:featureId` - Whether a feature is purchased

### AI
- `GET /api/ai/providers` - Configured AI providers and their status *(public)*

## Development Timeline

- **Phase 3.1** ✅ Setup & Auth (Week 1)
- **Phase 3.2** ✅ File Upload & Parsing (Week 2)
- **Phase 3.3** ✅ AI Integration — Claude and Gemini, async processing (Week 2-3)
- **Phase 3.4** ✅ Dashboard & Analytics (Week 3)
- **Phase 3.5** ✅ Custom Categories, incl. sub-categories (Week 4)
- **Phase 3.6** 🚧 Polish & Testing (Week 4-5) — backend unit tests in place;
  integration and E2E coverage still outstanding

See `PROJECT_STATUS.md` for detail.

## Environment Variables

`backend/.env.example` and `frontend/.env.example` are the authoritative lists —
copy each to `.env.local` and fill in the values.

Note that both `server.js` and `config/db.js` load **`.env.local`**, not `.env`.

### Email

Signup verification, OTP sign-in, and password reset all send mail. `EMAIL_PROVIDER`
chooses how:

- `console` — writes the message to the server log. No credentials, no network,
  so every email flow is testable locally out of the box. The server refuses to
  start on this provider when `NODE_ENV=production`, because verification codes
  would go to a log instead of a user.
- `sendgrid` — real delivery. Requires `SENDGRID_API_KEY`.

Unset, it picks `sendgrid` when a key is present and `console` otherwise.

Which features need which keys:

| Variable | Needed for | Without it |
| --- | --- | --- |
| `DB_*` | Everything | Server exits on startup |
| `JWT_SECRET` | Everything | Login and all authenticated routes fail |
| `GEMINI_API_KEY` / `ANTHROPIC_API_KEY` | Statement parsing, categorization | Uploads fail during processing |
| `EMAIL_PROVIDER` | Selects the mail transport | Auto: `sendgrid` if a key is set, else `console` |
| `SENDGRID_API_KEY` | Real email delivery | Falls back to the console provider in development |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Pricing page, premium features | Order creation returns an error |
| `FRONTEND_URL` | CORS | Browser requests are blocked |

## Testing

The backend suite uses the built-in `node:test` runner (Node 22+, no extra
dependencies). It runs in CI on every pull request.

```bash
npm test                          # run the suite
npm run test:watch --workspace=backend
```

Coverage focuses on the money-critical paths: statement normalization, Razorpay
signature verification, and OTP generation. A few tests deliberately assert
current *incorrect* behaviour so that known defects are visible and locked in
until fixed — each is commented with the reason.

Integration and E2E coverage are still outstanding.

## Deployment

Ready for deployment to:
- Frontend: Vercel
- Backend: Railway or Render
- Database: Supabase (PostgreSQL)
- File Storage: AWS S3 (for uploaded PDFs)

See deployment plan in plan file for details.

## Contributing

This is an active development project. Changes follow the SDLC plan in `/plans/start-with-sdlc-order-lazy-papert.md`

## License

MIT
