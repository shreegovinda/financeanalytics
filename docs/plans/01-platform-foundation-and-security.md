# PLAN-01: Platform Foundation, Security & Privacy Modernization

**Status**: Completed  
**Last Updated**: 2026-09-13  
**Authors**: Finlytix Core Engineering  

---

## 1. Objectives & Scope
1. **Internationalization & Format Preferences**:
   - Store user locale, timezone, currency, date format, and time format.
   - Format currencies (`formatCurrency`), numbers, and dates dynamically across Web and Mobile.
2. **AI Provider Catalogue & BYOK (Bring Your Own Key)**:
   - Allow users to select between platform-managed keys or supply their own Gemini / Claude API keys.
   - Store keys encrypted using authenticated AES-256-GCM encryption with `APP_ENCRYPTION_KEY`.
   - Never fall back to platform keys if BYOK key fails or is invalid.
3. **User Data Export**:
   - Machine-readable JSON export of all user statements, transactions, categories, and chat history.
   - Multi-page vector PDF export with ledger summaries, linked banks, and paginated transaction records.
4. **Account Closure & Deletion**:
   - Full erasure of user files, statement drafts, transactions, and chat records with password re-verification.
   - Minimal audit retention (`account_deletion_logs`) recording only an anonymized SHA-256 hash.
5. **PII & Secret Redaction**:
   - Redaction engine stripping JWTs, Bearer tokens, cookies, email addresses, and account numbers from logs and crash reports.
6. **Application-Level File Encryption**:
   - AES-256-GCM packed buffer encryption (`[12B IV][16B Tag][Ciphertext]`) for all uploaded bank statement PDFs and spreadsheets.

---

## 2. Architecture & File Locations
- **Database Schema**: `backend/db/schema.sql`
- **Crypto & Encryption Service**: `backend/services/crypto.js`
- **AI Execution Engine**: `backend/services/ai.js`, `backend/services/claude.js`, `backend/config/aiCatalogue.js`
- **Data Export Service**: `backend/services/exportService.js`, `backend/routes/export.js`
- **Account Closure Route**: `backend/routes/accountClosure.js`
- **Admin Metrics & Redaction**: `backend/middleware/admin.js`, `backend/routes/admin.js`, `backend/utils/redact.js`
- **Frontend Settings**: `frontend/app/settings/page.tsx`

---

## 3. Verification & Testing
- Unit tests: `backend/test/crypto.test.js`, `backend/test/ai-provider-keys.test.js`, `backend/test/user-data-export.test.js`, `backend/test/account-closure.test.js`, `backend/test/statement-file-encryption.test.js`.
- All 154 backend test cases passing.
