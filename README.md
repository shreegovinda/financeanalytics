# Financial Analytics Application

A personal finance statement analyzer that uses AI to automatically categorize bank transactions and provides comprehensive analytics dashboards.

## Features

- 📤 Upload bank statements (PDF/Excel) from Indian banks (ICICI, HDFC, Axis)
- 🤖 AI-powered transaction categorization using Claude API
- ✏️ Manual category override for transactions
- 📊 Beautiful analytics dashboards with:
  - Pie charts showing spending breakdown by category
  - Bar charts showing monthly income vs expenses
  - Monthly-wise analysis and trends
- 👤 User authentication with email/password and Google OAuth
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
psql -U postgres -d financeanalytics -f backend/config/schema.sql
```

> **Note:** `backend/config/schema.sql` is the canonical schema file and includes all migration steps. Alternatively, run `node backend/db/init.js` from the backend directory after `npm install` to apply the same schema programmatically.

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
│   │   ├── db.js           # Database connection
│   │   └── schema.sql      # Database schema
│   ├── routes/
│   │   └── auth.js         # Authentication endpoints
│   ├── middleware/
│   │   └── auth.js         # JWT verification
│   ├── services/           # File parsers, Claude integration
│   ├── models/             # Database models
│   └── server.js           # Express app entry
├── frontend/
│   ├── app/
│   │   ├── login/          # Login page
│   │   ├── signup/         # Signup page
│   │   └── dashboard/      # Main dashboard
│   ├── components/         # Reusable components
│   ├── lib/
│   │   ├── api.ts          # API helpers
│   │   └── store.ts        # Zustand store
│   └── public/             # Static assets
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user

### File Upload (Coming in Phase 3.2)
- `POST /api/upload` - Upload statement
- `GET /api/statements` - List statements

### Transactions (Coming in Phase 3.3+)
- `GET /api/transactions` - List transactions
- `PUT /api/transactions/:id` - Update category
- `GET /api/transactions/stats` - Get summary stats

### Analytics (Coming in Phase 3.4)
- `GET /api/analytics/pie` - Spending by category
- `GET /api/analytics/bar` - Monthly trends
- `GET /api/analytics/trends` - Month-over-month analysis

## Development Timeline

- **Phase 3.1** ✅ Setup & Auth (Week 1)
- **Phase 3.2** File Upload & Parsing (Week 2)
- **Phase 3.3** Claude AI Integration (Week 2-3)
- **Phase 3.4** Dashboard & Analytics (Week 3)
- **Phase 3.5** Custom Categories (Week 4)
- **Phase 3.6** Polish & Testing (Week 4-5)

## Environment Variables

### Backend (.env.local)
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=financeanalytics
PORT=3001
JWT_SECRET=super_secret_key
AI_PROVIDER=gemini
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-2.5-flash
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Testing

Coming in Phase 3.6 - Unit tests, integration tests, E2E tests with Cypress

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
