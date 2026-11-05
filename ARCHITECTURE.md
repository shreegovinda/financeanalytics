# Architecture Documentation

## Finlytix — Personal Finance Analytics Platform

**Document Version:** 2.0
**Date:** 2026-10-26
**Status:** Active
**Previous Version:** 1.0 (2026-04-22) — superseded; original focused on MVP with bank-specific parsers

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Entity-Relationship Diagram](#3-entity-relationship-diagram)
4. [API Surface](#4-api-surface)
5. [Data Flow Diagrams](#5-data-flow-diagrams)
6. [Security Architecture](#6-security-architecture)
7. [AI Provider Architecture](#7-ai-provider-architecture)
8. [Component Diagram](#8-component-diagram)
9. [Deployment Architecture](#9-deployment-architecture)
10. [Quality Infrastructure](#10-quality-infrastructure)
11. [Technical Debt Register](#11-technical-debt-register)

---

## 1. System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT LAYER                                   │
│                                                                             │
│   ┌───────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │
│   │  Web Frontend     │  │  Mobile App       │  │  WhatsApp Bot         │  │
│   │  Next.js 14       │  │  Expo SDK 52      │  │  Webhook Integration  │  │
│   │  React + TS       │  │  React Native     │  │  Phone Verification   │  │
│   │  Tailwind CSS     │  │  Biometric Auth   │  │  Statement Upload     │  │
│   │  Zustand          │  │  Secure Storage   │  │  AI Chat              │  │
│   │  Recharts         │  │  Expo Router      │  │                       │  │
│   │  Port 3000        │  │                   │  │                       │  │
│   └────────┬──────────┘  └────────┬──────────┘  └───────────┬───────────┘  │
│            │                      │                          │              │
│            │    ┌─────────────────┴──────────────────┐       │              │
│            │    │ @finlytix/shared                   │       │              │
│            ├────┤ Types · API Contracts · Formatters │───────┤              │
│            │    └────────────────────────────────────┘       │              │
└────────────┼────────────────────────────────────────────────┼──────────────┘
             │           HTTPS / REST API                     │
┌────────────┴────────────────────────────────────────────────┴──────────────┐
│                            API LAYER                                       │
│                                                                            │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Express.js — Port 3001                                              │  │
│  │                                                                      │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────────┐  │  │
│  │  │ CORS         │  │ JWT Auth     │  │ JSON Body Parser (50MB)   │  │  │
│  │  │ Middleware    │  │ Middleware   │  │ Raw body capture          │  │  │
│  │  └──────────────┘  └──────────────┘  └───────────────────────────┘  │  │
│  │                                                                      │  │
│  │  ┌─────────────────────── ROUTES ──────────────────────────────┐    │  │
│  │  │ auth · upload · transactions · categories · analytics      │    │  │
│  │  │ payments · ai · chat · banks · bills · export              │    │  │
│  │  │ accountClosure · support · admin · whatsappWebhook         │    │  │
│  │  │ activityLogs · twoFactor · passwordChange · updateProfile  │    │  │
│  │  └────────────────────────────────────────────────────────────┘    │  │
│  │                                                                      │  │
│  │  ┌─────────────────────── SERVICES ────────────────────────────┐    │  │
│  │  │ ai (provider router) · aiUseCases · aiValidation           │    │  │
│  │  │ chat · chatHistory · chatData · chatErrors                 │    │  │
│  │  │ claude · email · encryption · otp · payment · authToken    │    │  │
│  │  │ parsers/generic · bankCatalogue · whatsappService          │    │  │
│  │  │ whatsappChatHandler · whatsappUploadHandler · healthScore  │    │  │
│  │  │ activityLogService · costTransparency                       │    │  │
│  │  └────────────────────────────────────────────────────────────┘    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└──────────┬──────────────────────────────────┬──────────────────────────────┘
           │ SQL / TCP                        │ HTTPS
┌──────────┴──────────┐    ┌──────────────────┴─────────────────────────────┐
│   DATA LAYER        │    │   EXTERNAL SERVICES                            │
│                     │    │                                                 │
│  PostgreSQL 16      │    │  AI Providers:                                 │
│  20+ tables         │    │    Gemini · Claude · OpenAI                    │
│  Idempotent DDL     │    │    Groq · DeepSeek · Mistral                   │
│  AES-256-GCM        │    │                                                │
│  encrypted at rest  │    │  Payments:   Razorpay                          │
│  Cascading deletes  │    │  Email:      SendGrid / SMTP                   │
│  GDPR-ready         │    │  Messaging:  WhatsApp Business API             │
│                     │    │  Auth:       Google OAuth (planned)             │
└─────────────────────┘    └────────────────────────────────────────────────┘
```

---

## 2. Monorepo Structure

The project uses npm workspaces with four packages:

```
financeanalytics/                      # Root package.json (workspace orchestrator)
├── backend/                           # Express.js API server
│   ├── config/
│   │   ├── aiCatalogue.js             # 6 providers, 19 models catalogue
│   │   ├── db.js                      # PostgreSQL connection pool (pg)
│   │   └── legal.js                   # Legal/consent configuration
│   ├── data/
│   │   ├── faqs.json                  # Help centre content
│   │   └── indian-banks.json          # Bank master list
│   ├── db/
│   │   ├── schema.sql                 # Canonical schema (482 lines, idempotent)
│   │   └── init.js                    # Applies schema on boot
│   ├── middleware/
│   │   ├── auth.js                    # JWT verification + token_version check
│   │   └── admin.js                   # Role-based access control
│   ├── routes/                        # 18 route modules (~3,300 LOC total)
│   │   ├── auth.js                    # Register, login, OTP, email verify
│   │   ├── upload.js                  # Statement upload + background processing
│   │   ├── transactions.js            # CRUD, filters, pagination
│   │   ├── categories.js              # CRUD + bulk reassign + sub-categories
│   │   ├── analytics.js               # Pie, bar, trends aggregations
│   │   ├── payments.js                # Razorpay integration
│   │   ├── ai.js                      # Provider status, use-case settings
│   │   ├── chat.js                    # Conversations + messages + AI answers
│   │   ├── banks.js                   # Bank account management
│   │   ├── bills.js                   # Merchant bill attachment
│   │   ├── export.js                  # Data export (GDPR right to portability)
│   │   ├── accountClosure.js          # GDPR right to erasure
│   │   ├── support.js                 # Support tickets, crash reports
│   │   ├── admin.js                   # Admin dashboard, metrics, crash mgmt
│   │   ├── whatsappWebhook.js         # WhatsApp Business API webhook
│   │   ├── twoFactor.js               # 2FA setup (TOTP)
│   │   ├── twoFactorLogin.js          # 2FA login verification
│   │   ├── passwordChange.js          # Password update
│   │   ├── updateProfile.js           # Profile, preferences, i18n
│   │   └── activityLogs.js            # Security audit trail
│   ├── services/                      # 20+ service modules (~4,500 LOC total)
│   │   ├── ai.js                      # Provider router (6 providers, unified interface)
│   │   ├── aiUseCases.js              # Per-feature AI config resolution
│   │   ├── aiValidation.js            # Connection validation before save
│   │   ├── chat.js                    # AI chat orchestration
│   │   ├── chatHistory.js             # Message persistence
│   │   ├── chatData.js                # Financial context for AI
│   │   ├── chatErrors.js              # Safe error formatting
│   │   ├── claude.js                  # Batch categorization
│   │   ├── email.js                   # Provider: console / SendGrid / SMTP
│   │   ├── encryption.js              # AES-256-GCM + HMAC blind indexing
│   │   ├── otp.js                     # Crypto-random OTP generation
│   │   ├── payment.js                 # Razorpay order/verify
│   │   ├── authToken.js               # JWT sign/verify, token_version
│   │   ├── bankCatalogue.js           # Bank master data
│   │   ├── healthScore.js             # Finlytix health score algorithm
│   │   ├── costTransparency.js        # Usage metering and cost display
│   │   ├── whatsappService.js         # WhatsApp message send/receive
│   │   ├── whatsappChatHandler.js     # Chat message routing
│   │   ├── whatsappUploadHandler.js   # Statement upload via WhatsApp
│   │   ├── activityLogService.js      # Audit event logging
│   │   └── parsers/
│   │       └── generic.js             # AI-driven PDF/Excel statement parser
│   ├── utils/
│   │   ├── formatters.js              # Number/date formatting
│   │   ├── otpRateLimit.js            # In-memory OTP attempt tracking
│   │   ├── passwordValidation.js      # Password strength rules
│   │   └── redact.js                  # PII redaction for crash reports
│   ├── scripts/
│   │   ├── migrate-encrypt-sensitive-data.js
│   │   └── migrate-encrypt-statement-files.js
│   ├── test/                          # 38 test files, 200+ tests
│   ├── server.js                      # App entry point
│   └── package.json
│
├── frontend/                          # Next.js 14 web application
│   ├── app/                           # App Router pages
│   │   ├── auth/page.tsx              # Combined login/signup/OTP
│   │   ├── dashboard/page.tsx         # Summary widgets + charts
│   │   ├── transactions/page.tsx      # Transaction table + category editing
│   │   ├── analytics/page.tsx         # Charts and date-range analysis
│   │   ├── statements/page.tsx        # Upload history + per-statement detail
│   │   ├── statements/[id]/page.tsx   # Individual statement view
│   │   ├── assistant/page.tsx         # AI chat with conversations
│   │   ├── settings/page.tsx          # Profile, preferences, AI config
│   │   ├── activity/page.tsx          # Security activity log
│   │   ├── admin/page.tsx             # Admin dashboard
│   │   ├── help/page.tsx              # FAQ / support
│   │   ├── verify-email/page.tsx      # Email verification
│   │   ├── privacy/page.tsx           # Privacy policy
│   │   ├── terms/page.tsx             # Terms of service
│   │   ├── cookies/page.tsx           # Cookie policy
│   │   ├── layout.tsx                 # Root layout
│   │   ├── layout-client.tsx          # Client-side layout wrapper
│   │   ├── page.tsx                   # Landing / redirect
│   │   └── globals.css                # Tailwind base styles
│   ├── components/                    # 19 reusable components
│   │   ├── AppShell.tsx               # App chrome (sidebar, nav, breadcrumbs)
│   │   ├── AuthSessionGuard.tsx       # Auth gate wrapper
│   │   ├── FileUploadForm.tsx         # Drag-and-drop upload
│   │   ├── VoiceAssistantModal.tsx    # Speech recognition/synthesis
│   │   ├── AiUseCaseSettings.tsx      # Per-feature AI configuration
│   │   ├── FinlytixHealthScore.tsx    # Financial health gauge
│   │   ├── BillAttachDialog.tsx       # Bill attachment workflow
│   │   ├── StatementProcessingProgress.tsx  # Upload progress tracker
│   │   ├── DateRangePicker.tsx        # Date range filter
│   │   ├── MonthPicker.tsx            # Month selector
│   │   ├── ThemeSelector.tsx          # Dark/light/system theme
│   │   ├── ConfirmationDialog.tsx     # Generic confirm modal
│   │   ├── CrashReportModal.tsx       # Error reporting UI
│   │   ├── ProfileUpdateModals.tsx    # Profile edit modals
│   │   ├── TwoFactorModal.tsx         # 2FA setup UI
│   │   ├── AiProviderSelect.tsx       # Provider/model picker
│   │   ├── BankSettings.tsx           # Bank account management
│   │   ├── PhoneInput.tsx             # Phone number input
│   │   ├── Toast.tsx                  # Toast notifications
│   │   ├── Skeleton.tsx               # Loading skeleton
│   │   ├── ErrorBoundary.tsx          # React error boundary
│   │   ├── AssistantLink.tsx          # Navigation to assistant
│   │   └── BackButton.tsx             # Navigation back button
│   ├── lib/
│   │   ├── api.ts                     # Axios-based API client with interceptors
│   │   ├── store.ts                   # Zustand store (auth, transactions, UI)
│   │   ├── voice.ts                   # Web Speech API abstraction
│   │   ├── theme.tsx                  # Theme context provider
│   │   ├── date.ts                    # Date formatting utilities
│   │   ├── currency.ts               # Currency formatting
│   │   ├── formatters.ts             # Display formatters
│   │   ├── financeRefresh.ts          # Data refresh coordination
│   │   ├── translations.ts           # i18n translations
│   │   ├── aiProvider.ts             # AI provider helpers
│   │   ├── legal.ts                  # Legal content helpers
│   │   └── utils.ts                  # General utilities
│   ├── test/voice.test.mjs           # Voice functionality tests
│   └── package.json
│
├── shared/                            # Shared TypeScript package
│   ├── src/
│   │   ├── types/index.ts            # 26+ interfaces (User, Transaction, etc.)
│   │   ├── api/contracts.ts          # Request/response contracts
│   │   ├── formatters/index.ts       # Shared formatting logic
│   │   └── index.ts                  # Barrel export
│   ├── dist/                         # Compiled output
│   ├── tsconfig.json
│   └── package.json
│
├── mobile/                            # Expo/React Native app
│   ├── app/
│   │   ├── (auth)/                   # Auth screens (login, register)
│   │   ├── (tabs)/                   # Tab navigation
│   │   │   ├── index.tsx             # Dashboard
│   │   │   ├── transactions.tsx      # Transaction list
│   │   │   ├── analytics.tsx         # Charts
│   │   │   ├── upload.tsx            # Statement upload
│   │   │   └── assistant.tsx         # AI assistant
│   │   ├── settings.tsx              # Settings screen
│   │   └── _layout.tsx               # Root layout
│   ├── components/                   # 5 mobile components
│   ├── lib/
│   │   ├── api.ts                    # API client (shared types)
│   │   ├── biometrics.ts            # Face/Touch ID
│   │   ├── secureStorage.ts         # Expo Secure Store wrapper
│   │   └── theme.ts                 # Mobile theme
│   └── package.json
│
├── .husky/                           # Git hooks (pre-commit, pre-push)
├── .cursor/rules/                    # Development workflow rules
├── PROJECT_STATUS.md                 # Phase tracking
├── ANTIGRAVITY_HANDOVER.md           # Agent handover context
└── README.md                         # Setup instructions
```

---

## 3. Entity-Relationship Diagram

### Core Domain Model

```
                        ┌─────────────────────────────┐
                        │          users               │
                        ├─────────────────────────────┤
                        │ id UUID (PK)                 │
                        │ email VARCHAR(255) UNIQUE     │
                        │ password_hash VARCHAR(255)    │
                        │ name TEXT (encrypted)         │
                        │ phone TEXT (encrypted)        │
                        │ phone_hash VARCHAR(64)        │
                        │ google_id VARCHAR(255)        │
                        │ token_version INTEGER         │
                        │ email_verified BOOLEAN        │
                        │ role VARCHAR(20)              │
                        │ locale, timezone, currency    │
                        │ language, date_format         │
                        │ selected_ai_provider/model    │
                        │ ai_key_mode                   │
                        │ phone_verified, whatsapp_opt_in│
                        │ two_factor_method/secret      │
                        │ password_changed_at           │
                        │ created_at                    │
                        └──────┬───────────────────────┘
                               │
          ┌────────────────────┼────────────────────────┐
          │ 1:N                │ 1:N                    │ 1:N
          ▼                    ▼                        ▼
┌─────────────────┐  ┌─────────────────┐  ┌──────────────────────┐
│  categories     │  │  statements     │  │  user_bank_accounts  │
├─────────────────┤  ├─────────────────┤  ├──────────────────────┤
│ id UUID (PK)    │  │ id UUID (PK)    │  │ id UUID (PK)         │
│ user_id (FK)    │  │ user_id (FK)    │  │ user_id (FK)         │
│ name VARCHAR    │  │ bank_name       │  │ bank_code            │
│ color VARCHAR   │  │ file_name       │  │ catalogue_id (FK)    │
│ is_default BOOL │  │ status          │  │ active               │
│ parent_id (FK)  │  │ processing_*    │  └──────────────────────┘
│ (sub-categories)│  │ ai_provider     │
└─────────────────┘  │ statement_month │
          │          │ bank_account_id │
          │          │ currency        │
          │          └────────┬────────┘
          │                   │
          │          ┌────────┴────────────────────┐
          │          │ 1:N                         │ 1:1
          │          ▼                             ▼
          │  ┌───────────────────┐  ┌──────────────────────┐
          │  │  transactions     │  │  statement_drafts    │
          │  ├───────────────────┤  ├──────────────────────┤
          │  │ id UUID (PK)     │  │ id UUID (PK)         │
          │  │ user_id (FK)     │  │ statement_id (FK) UQ  │
          │  │ statement_id (FK)│  │ payload JSONB         │
          │  │ date DATE        │  │ transaction_count     │
          └──┤ category_id (FK) │  │ total_debit/credit   │
             │ amount DECIMAL   │  │ currency              │
             │ description TEXT │  └──────────────────────┘
             │ type VARCHAR     │
             │ source_index INT │
             │ currency VARCHAR │
             │ has_bill BOOLEAN │
             └──────┬──────────┘
                    │ 1:N
                    ▼
          ┌────────────────────┐
          │ transaction_bills  │
          ├────────────────────┤
          │ id, transaction_id │
          │ merchant_name      │
          │ bill_total, status │
          │ payload JSONB      │
          └────────┬───────────┘
                   │ 1:N
                   ▼
          ┌─────────────────────┐
          │ transaction_line_   │
          │ items               │
          ├─────────────────────┤
          │ description, qty    │
          │ unit_price, amount  │
          └─────────────────────┘
```

### Supporting Tables

```
┌───────────────────────────┐  ┌────────────────────────────┐
│ chat_conversations        │  │ chat_messages              │
├───────────────────────────┤  ├────────────────────────────┤
│ id, user_id, title        │  │ id, user_id, role, content │
│ created_at, updated_at    │  │ conversation_id (FK)       │
│ UNIQUE(id, user_id)       │  │ result JSONB, sequence     │
└───────────────────────────┘  └────────────────────────────┘

┌───────────────────────────┐  ┌────────────────────────────┐
│ user_ai_use_cases         │  │ user_ai_keys               │
├───────────────────────────┤  ├────────────────────────────┤
│ user_id + use_case (PK)   │  │ id, user_id, provider (UQ) │
│ provider, model, key_mode │  │ encrypted_key, key_hint    │
│ encrypted_key, key_hint   │  └────────────────────────────┘
│ validated_at              │
└───────────────────────────┘

┌───────────────────────────┐  ┌────────────────────────────┐
│ payments                  │  │ otp_codes                  │
├───────────────────────────┤  ├────────────────────────────┤
│ razorpay_order_id (UQ)    │  │ email, code, purpose       │
│ amount, currency, status  │  │ phone, is_used, expires_at │
│ feature, metadata JSONB   │  └────────────────────────────┘
└───────────────────────────┘

┌───────────────────────────┐  ┌────────────────────────────┐
│ activity_logs             │  │ crash_reports              │
├───────────────────────────┤  ├────────────────────────────┤
│ user_id, action, category │  │ user_id, error_summary     │
│ description, details JSONB│  │ error_details JSONB        │
│ ip_address                │  │ status (open/investigating │
└───────────────────────────┘  │  /resolved)                │
                               └────────────────────────────┘

┌───────────────────────────┐  ┌────────────────────────────┐
│ email_verification_tokens │  │ user_consents              │
├───────────────────────────┤  ├────────────────────────────┤
│ token_hash (SHA-256)      │  │ policy_version, ip_address │
│ user_id, expires_at       │  │ user_agent, consented_at   │
└───────────────────────────┘  └────────────────────────────┘

┌───────────────────────────┐  ┌────────────────────────────┐
│ statement_files           │  │ account_deletion_logs      │
├───────────────────────────┤  ├────────────────────────────┤
│ statement_id (PK, FK)     │  │ anonymized_user_id         │
│ content BYTEA             │  │ statement/transaction_count│
│ content_type, is_encrypted│  │ closed_at                  │
└───────────────────────────┘  └────────────────────────────┘

┌───────────────────────────┐  ┌────────────────────────────┐
│ bank_catalogue            │  │ whatsapp_conversations     │
├───────────────────────────┤  ├────────────────────────────┤
│ id TEXT (PK), name        │  │ user_id, phone, phone_hash │
│ category, active          │  │ current_draft_id (FK)      │
└───────────────────────────┘  └────────────────────────────┘
```

### Index Strategy

```
Performance indices:
  transactions(user_id, date)                      # Primary query pattern
  transactions(category_id)                        # Analytics joins
  transactions(statement_id)                       # Statement detail view
  transactions(statement_id, source_index) UNIQUE  # Dedup guard
  statements(user_id)                              # Statement list
  statements(user_id, bank_name, statement_month)  # Duplicate detection
  categories(user_id)                              # Category list
  categories(parent_id)                            # Sub-category lookup

Security indices:
  users(email) UNIQUE                              # Login lookup
  users(phone_hash)                                # Blind index for phone
  otp_codes(email, purpose, expires_at)            # OTP validation
  otp_codes(phone_hash)                            # WhatsApp OTP
  activity_logs(user_id, created_at DESC)           # Audit timeline

Uniqueness constraints:
  categories(user_id, LOWER(name)) WHERE parent_id IS NULL     # Root uniqueness
  categories(user_id, parent_id, LOWER(name)) WHERE NOT NULL   # Child uniqueness
  statements(user_id, bank_account_id, statement_month)         # No dup uploads
  user_ai_use_cases(user_id, use_case)                          # One config per feature
```

---

## 4. API Surface

All routes prefixed with `/api`. Unless marked *public*, routes require `Authorization: Bearer <token>`.

### Authentication (`/api/auth`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/auth/register` | Register with email/password | Public |
| POST | `/auth/verify-email` | Confirm 6-digit email code | Public |
| POST | `/auth/verify-email-link` | Confirm magic link token | Public |
| POST | `/auth/login` | Login with credentials | Public |
| POST | `/auth/send-otp` | Request OTP for login | Public |
| POST | `/auth/verify-otp` | OTP-based login | Public |
| POST | `/auth/check-email` | Check email availability | Public |
| POST | `/auth/forgot-password` | Request password reset OTP | Public |
| POST | `/auth/reset-password` | Apply password reset | Public |
| GET | `/auth/profile` | Get user profile | ✅ |
| PUT | `/auth/profile` | Update profile/preferences | ✅ |
| PUT | `/auth/password-update` | Change password | ✅ |
| POST | `/auth/2fa/setup` | Enable TOTP 2FA | ✅ |
| POST | `/auth/2fa/verify` | Verify TOTP code during login | ✅ |

### Statements & Upload (`/api/upload`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/upload` | Upload PDF/Excel statement | ✅ |
| GET | `/upload/statements` | List user's statements | ✅ |
| GET | `/upload/statements/:id` | Statement detail + draft | ✅ |
| POST | `/upload/statements/:id/confirm` | Confirm draft → commit | ✅ |
| POST | `/upload/statements/:id/discard` | Discard draft | ✅ |
| DELETE | `/upload/statements/:id` | Delete statement + transactions | ✅ |
| GET | `/upload/statements/:id/download` | Download original file | ✅ |

### Transactions (`/api/transactions`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/transactions` | List with pagination + filters | ✅ |
| GET | `/transactions/stats/summary` | Total income/expenses/count | ✅ |
| PUT | `/transactions/:id/category` | Update category | ✅ |
| PUT | `/transactions/:id/description` | Update description | ✅ |

### Categories (`/api/categories`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/categories` | List with sub-categories | ✅ |
| POST | `/categories` | Create category | ✅ |
| PUT | `/categories/:id` | Update name/color | ✅ |
| DELETE | `/categories/:id` | Delete category | ✅ |
| POST | `/categories/bulk-reassign` | Move transactions between categories | ✅ |

### Analytics (`/api/analytics`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/analytics/pie` | Spending by category | ✅ |
| GET | `/analytics/bar` | Monthly income vs expenses | ✅ |
| GET | `/analytics/trends` | Month-over-month analysis | ✅ |

### Bills (`/api/transactions/:transactionId/bills`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/:transactionId/bills` | Upload + parse a bill | ✅ |
| GET | `/:transactionId/bills` | Get bills + line items | ✅ |
| POST | `/:transactionId/bills/:billId/confirm` | Confirm bill attachment | ✅ |
| POST | `/:transactionId/bills/:billId/discard` | Discard pending bill | ✅ |

### AI & Chat (`/api/ai`, `/api/chat`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/ai/providers` | AI provider catalogue + status | Public |
| GET | `/ai/use-cases` | User's per-feature AI config | ✅ |
| POST | `/ai/use-cases` | Save feature AI settings | ✅ |
| POST | `/ai/validate` | Validate AI connection | ✅ |
| GET | `/chat/conversations` | List conversations | ✅ |
| POST | `/chat/conversations` | Create conversation | ✅ |
| DELETE | `/chat/conversations/:id` | Delete conversation | ✅ |
| GET | `/chat/messages` | Get messages (conversation or saved) | ✅ |
| POST | `/chat/message` | Send message → get AI response | ✅ |

### Payments (`/api/payments`)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/payments/pricing` | Feature catalogue | Public |
| POST | `/payments/create-order` | Razorpay order | ✅ |
| POST | `/payments/verify` | Verify Razorpay payment | ✅ |
| GET | `/payments/history` | Payment history | ✅ |
| GET | `/payments/check/:featureId` | Check feature purchase | ✅ |

### Admin, Support, Export

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/admin/metrics` | Platform metrics | Admin |
| GET | `/admin/crash-reports` | Crash reports | Admin |
| PATCH | `/admin/crash-reports/:id` | Update status | Admin |
| GET | `/export/data` | Full data export (GDPR) | ✅ |
| POST | `/account/close` | Account deletion (GDPR) | ✅ |
| POST | `/support/crash-report` | Submit crash report | ✅ |
| GET | `/activity-logs` | Security audit trail | ✅ |
| GET | `/banks` | Bank accounts list | ✅ |
| POST | `/banks` | Add bank account | ✅ |
| DELETE | `/banks/:id` | Remove bank account | ✅ |

---

## 5. Data Flow Diagrams

### 5.1 Statement Processing Pipeline

```
User                Frontend              Backend                    AI Provider       Database
 │                    │                     │                          │                 │
 │── Upload File ────►│                     │                          │                 │
 │   (PDF/Excel)      │── POST /upload ────►│                          │                 │
 │                    │   FormData          │── Validate (size, type) ─┐                │
 │                    │                     │◄──────────────────────────┘                │
 │                    │                     │── Encrypt file (AES-256)─►│               │
 │                    │                     │── INSERT statement ───────────────────────►│
 │                    │                     │   status='processing'     │                │
 │                    │◄── 202 Accepted ────│                          │                 │
 │                    │                     │                          │                 │
 │                    │               BACKGROUND PROCESSING            │                 │
 │                    │                     │── Parse file ─────────────►                │
 │                    │                     │   (structured output)     │                │
 │                    │                     │◄── Extracted txns ────────│                │
 │                    │                     │── Detect bank, month ────┐                │
 │                    │                     │◄─────────────────────────┘                │
 │                    │                     │── INSERT statement_draft ─────────────────►│
 │                    │                     │   status='pending_review'  │               │
 │                    │                     │                            │               │
 │◄── Poll status ───►│── GET statement ───►│◄── draft data ───────────────────────────│
 │                    │◄── Draft preview ───│                            │               │
 │                    │                     │                            │               │
 │── Confirm ────────►│── POST confirm ────►│                            │               │
 │                    │                     │── INSERT transactions ────────────────────►│
 │                    │                     │── Queue categorization ───►│               │
 │                    │                     │◄── AI categories ─────────│               │
 │                    │                     │── UPDATE ai_suggested ────────────────────►│
 │                    │◄── Success ─────────│                            │               │
```

### 5.2 AI Chat Flow

```
User              Frontend              Backend                  AI Provider
 │                  │                     │                         │
 │── Ask question ─►│                     │                         │
 │                  │── POST /chat/msg ──►│                         │
 │                  │                     │── Resolve AI config ───┐│
 │                  │                     │   (per-use-case)       ││
 │                  │                     │◄──────────────────────┘│
 │                  │                     │── Build context ──────┐ │
 │                  │                     │   (chat history +     │ │
 │                  │                     │    financial summary)  │ │
 │                  │                     │◄──────────────────────┘ │
 │                  │                     │── Send to provider ────►│
 │                  │                     │◄── AI response ─────────│
 │                  │                     │── Save user msg ──────►DB
 │                  │                     │── Save assistant msg ─►DB
 │                  │◄── AI answer ───────│                         │
 │◄── Display ──────│                     │                         │
```

---

## 6. Security Architecture

### Authentication Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Authentication Layers                      │
│                                                              │
│  Layer 1: Registration                                       │
│  ├── Email + Password (bcrypt hashed)                        │
│  ├── Consent capture (versioned, IP + UA)                    │
│  └── Email verification (SHA-256 hashed token)               │
│                                                              │
│  Layer 2: Login                                              │
│  ├── Option A: Password-based login                          │
│  ├── Option B: OTP-based login (crypto-random 6-digit)       │
│  └── Both: token_version check (session invalidation)        │
│                                                              │
│  Layer 3: Two-Factor Authentication (optional)               │
│  └── TOTP (RFC 6238)                                         │
│                                                              │
│  Layer 4: Session Management                                 │
│  ├── JWT with token_version in payload                       │
│  ├── password_changed_at invalidates old tokens              │
│  └── No refresh token (single JWT strategy)                  │
│                                                              │
│  Layer 5: Authorization                                      │
│  ├── auth middleware: JWT verify + version check              │
│  ├── admin middleware: role === 'admin'                       │
│  └── Per-query user_id scoping (row-level security)          │
└─────────────────────────────────────────────────────────────┘
```

### Encryption Strategy

```
Data at Rest:
  ├── Statement files: AES-256-GCM (application-level)
  ├── User PII (name, phone): AES-256-GCM with blind index
  ├── AI API keys: AES-256-GCM per-user encryption
  ├── Chat messages: AES-256-GCM encrypted titles
  ├── OTP codes: stored raw (short-lived, 6 digits)
  └── Passwords: bcrypt hash

Blind Indexing:
  ├── phone_hash: HMAC-SHA256 for lookup without decryption
  └── Used in: users.phone_hash, otp_codes.phone_hash,
      whatsapp_conversations.phone_hash

Token Security:
  ├── Email verification: SHA-256 hash stored, raw in email only
  ├── JWT: HS256, token_version prevents replay after password change
  └── OTP: crypto.randomInt() (not Math.random())
```

### GDPR Compliance

```
Right to Access:     GET /api/export/data
Right to Erasure:    POST /api/account/close
Right to Portability: GET /api/export/data (JSON format)
Data Minimization:   account_deletion_logs stores only anonymized counts
Consent:             user_consents tracks versioned consent with metadata
```

---

## 7. AI Provider Architecture

### Provider Abstraction

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Provider Router (ai.js)                    │
│                                                                  │
│  Unified Interface:                                              │
│    callAI({ provider, model, messages, config }) → response      │
│                                                                  │
│  ┌──────────┬──────────┬──────────┬──────────┬─────────────────┐│
│  │  Gemini  │ Anthropic│  OpenAI  │   Groq   │ DeepSeek/Mistral││
│  │          │ (Claude) │          │          │                  ││
│  │ REST API │ REST API │ REST API │ REST API │ REST API         ││
│  └──────────┴──────────┴──────────┴──────────┴─────────────────┘│
│                                                                  │
│  Features:                                                       │
│  ├── JSON structured output (schema-driven parsing)              │
│  ├── jsonrepair for malformed AI responses                       │
│  ├── Retry with exponential backoff                              │
│  ├── Request timeout handling                                    │
│  ├── Token counting / cost estimation                            │
│  └── Error normalization                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Per-Feature AI Configuration

```
Six independent use cases, each with own provider/model/key:

  ┌─────────────────────┬──────────────────────────────┐
  │ Use Case            │ Purpose                       │
  ├─────────────────────┼──────────────────────────────┤
  │ text_chat           │ Assistant chat responses       │
  │ voice_chat          │ Voice assistant answers        │
  │ statement_extraction│ PDF/Excel → structured data    │
  │ categorization      │ Transaction categorization     │
  │ bill_extraction     │ Merchant bill parsing          │
  │ whatsapp_chat       │ WhatsApp bot responses         │
  └─────────────────────┴──────────────────────────────┘

  Key Modes:
  ├── admin:    Platform-provided API key
  ├── saved:    User's previously validated key (from user_ai_keys)
  └── personal: User's dedicated encrypted key per use case
```

### AI Model Catalogue (19 models across 6 providers)

```
Gemini:    gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash
Anthropic: claude-sonnet-4-20250514, claude-3-5-haiku-20241022
OpenAI:    gpt-4o, gpt-4o-mini, o3-mini
Groq:      llama-3.3-70b-versatile, llama-3.1-8b-instant,
           gemma2-9b-it, mixtral-8x7b-32768
DeepSeek:  deepseek-chat, deepseek-reasoner
Mistral:   mistral-large-latest, mistral-small-latest,
           open-mistral-nemo, codestral-latest
```

---

## 8. Component Diagram

### Frontend Component Tree

```
layout.tsx (Root)
└── layout-client.tsx (Client Providers)
    └── ThemeProvider
        └── ErrorBoundary
            └── AuthSessionGuard
                └── AppShell (Sidebar + Nav + Main Area)
                    ├── /dashboard → Dashboard
                    │   ├── Summary Cards (income, expenses, count)
                    │   ├── PieChart (Recharts)
                    │   ├── BarChart (Recharts)
                    │   └── FinlytixHealthScore
                    │
                    ├── /transactions → TransactionsPage
                    │   ├── DateRangePicker
                    │   ├── Transaction Table (ag-grid)
                    │   └── BillAttachDialog
                    │
                    ├── /analytics → AnalyticsPage
                    │   ├── MonthPicker
                    │   ├── PieChart + BarChart
                    │   └── Trends Table
                    │
                    ├── /statements → StatementsPage
                    │   ├── FileUploadForm
                    │   ├── StatementProcessingProgress
                    │   └── Statement List
                    │
                    ├── /assistant → AssistantPage
                    │   ├── Conversation Sidebar (desktop)
                    │   ├── Chat List (mobile)
                    │   ├── Message Thread
                    │   ├── Composer
                    │   └── VoiceAssistantModal
                    │
                    ├── /settings → SettingsPage
                    │   ├── ProfileUpdateModals
                    │   ├── AiUseCaseSettings
                    │   ├── BankSettings
                    │   ├── TwoFactorModal
                    │   └── ThemeSelector
                    │
                    └── /admin → AdminPage
                        ├── Metrics Dashboard
                        └── CrashReportModal
```

### State Management (Zustand)

```
useStore
├── Auth State
│   ├── user: User | null
│   ├── token: string | null
│   ├── isAuthenticated: boolean
│   └── login() / logout() / setUser()
│
├── Financial Data
│   ├── transactions: Transaction[]
│   ├── categories: Category[]
│   ├── statements: Statement[]
│   ├── summaryStats: SummaryStats
│   └── fetch*() actions for each
│
├── UI State
│   ├── sidebarOpen: boolean
│   ├── theme: 'light' | 'dark' | 'system'
│   ├── toasts: Toast[]
│   └── loading states
│
└── Filters
    ├── dateRange: { start, end }
    ├── selectedCategory: string | null
    └── searchQuery: string
```

---

## 9. Deployment Architecture

### Current Development Environment

```
┌─────────────────────────────────────────────┐
│ Developer Machine (macOS)                    │
│                                              │
│  ┌──────────────────┐  ┌────────────────┐   │
│  │ Frontend          │  │ Backend         │   │
│  │ next dev          │  │ node server.js  │   │
│  │ localhost:3000    │◄─│ localhost:3001  │   │
│  └──────────────────┘  └────────┬───────┘   │
│                                  │           │
│                        ┌────────▼───────┐   │
│                        │ PostgreSQL 16   │   │
│                        │ localhost:5432  │   │
│                        │ financeanalytics│   │
│                        └────────────────┘   │
│                                              │
│  Email: console provider (logs to stdout)    │
│  AI: GEMINI/ANTHROPIC keys in .env.local     │
└─────────────────────────────────────────────┘
```

### Target Production Architecture

```
┌────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Vercel   │     │  Railway/Render   │     │   Supabase   │
│  Frontend  │────►│  Backend API      │────►│  PostgreSQL  │
│  CDN Edge  │     │  Docker Container │     │  Managed     │
│  HTTPS     │     │  HTTPS            │     │  Backups     │
└────────────┘     └────────┬──────────┘     └──────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
        ┌─────▼──────┐ ┌───▼─────┐ ┌────▼─────┐
        │ AI APIs     │ │Razorpay │ │SendGrid/ │
        │ (6 provs)   │ │Payments │ │ SMTP     │
        └────────────┘ └─────────┘ └──────────┘
```

### CI/CD Pipeline

```
Push to Branch
      │
      ▼
GitHub Actions
├── ESLint (0 warnings)
├── Prettier format check
├── Backend tests (node --test)
├── Frontend TypeScript check
├── Mobile TypeScript check
├── Shared package build
├── Next.js production build
└── SonarCloud analysis (when configured)
      │
      ▼
Pull Request
├── Automated checks must pass
├── Code review checklist
└── Manual approval required
```

---

## 10. Quality Infrastructure

### Test Coverage

| Area | Framework | Count | Coverage Focus |
|------|-----------|-------|----------------|
| Backend unit | node:test | 200+ | Parsers, OTP, payments, auth, encryption |
| Voice | node:test | 18 | Speech synthesis/recognition |
| Integration | node:test | ~10 | AI config persistence, chat isolation, statement lifecycle |
| Frontend | - | 0 | ⚠️ No frontend tests |
| E2E | - | 0 | ⚠️ No E2E tests |
| Mobile | - | 0 | ⚠️ No mobile tests |

### Code Quality Tools

```
ESLint:      Flat config, --max-warnings 0
Prettier:    Consistent formatting
Husky:       Pre-commit (lint-staged), pre-push
lint-staged: Auto-fix + format on commit
SonarCloud:  Static analysis (when token configured)
```

---

## 11. Technical Debt Register

### Critical Priority

| ID | Issue | Impact | Effort |
|----|-------|--------|--------|
| TD-01 | `next-auth` installed but unused — only critical npm audit vuln | Security | Low |
| TD-02 | `xlsx` has unfixed prototype pollution + ReDoS, parses untrusted uploads | Security | Medium |
| TD-03 | No rate limiting on `send-otp` (unauthenticated, unthrottled) | Security | Low |

### High Priority

| ID | Issue | Impact | Effort |
|----|-------|--------|--------|
| TD-04 | No global Express error handler (unhandled errors leak stack) | Reliability | Low |
| TD-05 | No rate limiting on `login` endpoint | Security | Low |
| TD-06 | `check-email` discloses account existence and holder's name | Privacy | Low |
| TD-07 | OTP attempt map is unbounded and per-process (memory leak risk) | Reliability | Low |
| TD-08 | No frontend test coverage | Quality | High |
| TD-09 | No E2E test coverage | Quality | High |

### Medium Priority

| ID | Issue | Impact | Effort |
|----|-------|--------|--------|
| TD-10 | Razorpay signature compared non-timing-safely | Security | Low |
| TD-11 | Feature-id guard bypassed by inherited Object keys | Security | Low |
| TD-12 | Upload type validated by filename only (not magic bytes) | Security | Low |
| TD-13 | No password strength requirement at registration | Security | Low |
| TD-14 | Emails matched case-sensitively (duplicate accounts) | Data integrity | Medium |
| TD-15 | `limit`/`offset` unvalidated on GET /transactions | Reliability | Low |
| TD-16 | Dead code: icici.js, hdfc.js, axis.js parsers + test scripts | Maintenance | Low |
| TD-17 | SonarCloud action pinned to mutable `@master` ref | CI stability | Low |
| TD-18 | `crypto` npm shim installed (deprecated, builtin available) | Dependencies | Low |
| TD-19 | Bulk insert can exceed Postgres parameter cap (~10,900 rows) | Data processing | Medium |

### Low Priority

| ID | Issue | Impact | Effort |
|----|-------|--------|--------|
| TD-20 | `/trends` and `/pie` disagree on uncategorized rows | UX consistency | Low |
| TD-21 | Google OAuth variables exist but flow not implemented | Dead config | Low |

---

*This document reflects the codebase at commit history through October 2026. Update this document when adding new modules, tables, or architectural changes.*
