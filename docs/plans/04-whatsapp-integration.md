# PLAN-04: WhatsApp Platform Integration (Uploads, Auth & AI Copilot)

**Status**: Completed  
**Last Updated**: 2026-09-13  
**Authors**: Finlytix Core Engineering  

---

## 1. Objectives & User Journey

Finlytix integrates with the **Meta WhatsApp Cloud API** (and pluggable **Twilio WhatsApp** adapter) to deliver zero-friction financial management natively inside WhatsApp:

1. **Statement Document Ingestion**:
   - User forwards or uploads bank statements (PDF / XLSX) via WhatsApp chat.
   - User can include an optional caption with bank name or month (e.g., "HDFC Jan 2026") or let the AI auto-detect from header text.
   - The file is downloaded securely, validated, and parsed by Finlytix's extraction pipeline.
   - An interactive WhatsApp summary card is sent to the user:
     ```
     📄 *Statement Analyzed: HDFC Bank (Jan 2026)*
     ───────────────────────────
     • Total Transactions: 42
     • Total Inflow: ₹1,20,500.00
     • Total Outflow: ₹48,320.00
     
     Tap an action below to commit to your live ledger:
     ```
   - Interactive buttons: `[✅ Confirm & Import]` | `[📊 View Summary]` | `[❌ Discard]`.
   - On confirmation, transactions are committed to the live ledger and background categorization is triggered.

2. **Authentication & Mobile Verification**:
   - **Passwordless Login**: Users enter their mobile number on Web/Mobile app -> receive a 6-digit OTP and 1-tap Magic Link in WhatsApp -> enter OTP or tap link to sign in.
   - **Phone Verification**: Verifies phone number on signup or profile update via WhatsApp OTP/link, updating `users.phone_verified = true`.

3. **Full "Ask Finlytix" AI Copilot within WhatsApp**:
   - Natural language queries directly in chat:
     - *"How much did I spend on dining this month?"*
     - *"Show me my top 5 expenses in February"*
     - *"What is my current net cashflow?"*
     - *"Did I receive salary this month?"*
   - Modular integration with `chatService.answerQuestion`, executing tool-calling against PostgreSQL ledger records and formatting responses into clean, readable WhatsApp markdown.

---

## 2. Architecture & Components

```
                ┌────────────────────────────────┐
                │   User on WhatsApp Client      │
                └───────────────┬────────────────┘
                                │ HTTPS Inbound Webhook / Outbound API
                ▼               ▼
        ┌─────────────────────────────────────────────────┐
        │  Meta WhatsApp Cloud API / Twilio Adapter       │
        └───────────────────────┬─────────────────────────┘
                                │
                                ▼
        ┌─────────────────────────────────────────────────┐
        │  POST /api/whatsapp/webhook                     │
        │  - Validates X-Hub-Signature-256                │
        │  - Extracts event payload                       │
        └───────────┬───────────┬───────────┬─────────────┘
                    │           │           │
           Document │           │ Button    │ Text Query
           Message  │           │ Response  │
                    ▼           ▼           ▼
          ┌──────────────────┐ ┌─────────────────┐ ┌───────────────┐
          │ Download Media   │ │ Confirm /       │ │ answerQuestion│
          │ parseStatement   │ │ Discard Draft   │ │ chatData Tools│
          │ Create Draft     │ │ Commit to Ledger│ │ Gemini/Claude │
          └──────────────────┘ └─────────────────┘ └───────────────┘
```

---

## 3. Database Schema Updates
- `users`:
  - `phone_verified BOOLEAN NOT NULL DEFAULT FALSE`
  - `phone_verified_at TIMESTAMP`
  - `whatsapp_opt_in BOOLEAN NOT NULL DEFAULT TRUE`
  - `whatsapp_session_updated_at TIMESTAMP`
- `whatsapp_conversations`:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `phone VARCHAR(50) NOT NULL`
  - `last_message_id TEXT`
  - `current_draft_id UUID REFERENCES statement_drafts(id) ON DELETE SET NULL`
  - `created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
  - `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
- `otp_codes`:
  - `phone VARCHAR(50)` (alongside `email`) with conditional constraints.
- Index: `CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);`

---

## 4. Implementation Phases & Delivered Modules
1. **Infrastructure Service** (`backend/services/whatsappService.js`):
   - `normalizePhoneNumber`: Formats Indian & international phone numbers with country code.
   - `verifyWebhookSignature`: HMAC-SHA256 signature verification matching Meta Cloud API spec.
   - `sendTextMessage` / `sendInteractiveButtons` / `sendOtpTemplate`: Dispatches interactive messages or queues simulation messages during testing/dev.
   - `downloadMedia`: Streams media from Meta Graph API with offline mock fallback.
2. **Authentication Flow** (`backend/services/otp.js` & `backend/routes/auth.js`):
   - `POST /api/auth/whatsapp/send-otp`: Sends 6-digit security code and 1-tap magic link.
   - `POST /api/auth/whatsapp/verify-otp`: Validates code, marks `phone_verified = true`, issues JWT.
   - Frontend UI (`frontend/app/auth/page.tsx`): "Sign in with WhatsApp" tab + 1-tap Magic Link auto-login.
   - Mobile API Client (`mobile/lib/api.ts`): Added `sendWhatsAppOtp` and `verifyWhatsAppOtp`.
3. **Webhook & Router** (`backend/routes/whatsappWebhook.js`):
   - `GET /api/whatsapp/webhook`: Handles Hub verification challenge.
   - `POST /api/whatsapp/webhook`: Ingestion engine branching to upload handler, interactive reply handler, or AI chat handler.
4. **Statement Upload & Interactive Drafts** (`backend/services/whatsappUploadHandler.js`):
   - `parseCaptionHints`: Extracts bank & month hints from message captions.
   - Creates `pending_review` statement and staging draft (`statement_drafts`).
   - Dispatches 3-button interactive card (`Confirm & Import`, `View Summary`, `Discard`).
   - On confirmation: imports transactions to ledger, removes draft, marks statement completed, triggers background categorization.
5. **Conversational Copilot** (`backend/services/whatsappChatHandler.js`):
   - Resolves user by registered phone.
   - Invokes `chat.answerQuestion` with full tool calling against PostgreSQL transactions, spending breakdown, and budgets.
   - Formats answers into clean WhatsApp markdown.

---

## 5. Verification & Test Results
- **Automated WhatsApp Suite**: `backend/test/whatsapp-integration.test.js` (8/8 tests pass).
  - Phone normalization & HMAC signature security.
  - WhatsApp OTP dispatch, verification, replay rejection.
  - Caption bank/month parsing across multiple phrasings.
  - Document upload, draft creation, interactive confirmation, and ledger commit.
  - Conversational AI financial queries and unregistered user onboarding.
- **Backend Test Suite**: 162/162 passing tests (`npm test --workspace=backend`).
- **Mobile TypeScript**: 0 errors (`npx tsc --noEmit --project mobile/tsconfig.json`).
- **Frontend Build**: Production build succeeded with zero errors (`npm run build --workspace=frontend -- --webpack`).
- **Linter & Code Style**: Clean pass across all workspaces (`npm run lint`, `npm run format:check`).
