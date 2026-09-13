# PLAN-05: Comprehensive Sensitive Data Encryption at Rest (Database Defense-in-Depth)

**Status**: Completed  
**Last Updated**: 2026-09-13  
**Authors**: Finlytix Core Security Engineering  

---

## 1. Problem Statement & Threat Model

### Current Vulnerability
While uploaded original statement files (`statement_files.content`) and user personal AI keys (`user_ai_keys.encrypted_key`) are encrypted using AES-256-GCM, other sensitive financial and identity records were previously stored in plaintext in PostgreSQL:
1. `transactions.description`: Plaintext transaction narratives (e.g., medical clinics, employer salary details, landlord rent, UPI IDs, merchant names).
2. `statement_drafts.payload`: Plaintext JSONB containing complete extracted statement data (all transactions, dates, amounts, bank names, branch details).
3. `chat_messages.content` & `result`: Plaintext records of users' private financial discussions with the Finlytix AI Copilot.
4. `transaction_bills.merchant_name`, `file_name`, `payload`: Plaintext merchant receipt data and line items.
5. `transaction_line_items.description`: Plaintext item names.
6. `users.name` & `phone`: Plaintext personal identifying information (PII).

### Target Threat Model
Anyone with direct read access to the PostgreSQL database (compromised database host, stolen `.sql` backup dump, read replica snapshot leak, rogue DBA, or unauthorized SQL access) must see **only authenticated AES-256-GCM ciphertexts** and cryptographic blind hashes. Without the application server's master `APP_ENCRYPTION_KEY` (kept strictly in the backend application environment/KMS), no sensitive user data can be decrypted or read.

---

## 2. Cryptographic Architecture

```
                  ┌──────────────────────────────────────────────┐
                  │        Backend Application Layer             │
                  │   - Holds APP_ENCRYPTION_KEY (AES-256-GCM)   │
                  │   - Holds BLIND_INDEX_SALT (HMAC-SHA256)     │
                  └──────────────┬───────────────────────────────┘
                                 │
                 Write: Encrypt  │  Read: Decrypt
                 & Compute Hash  │  & Verify Auth Tag
                                 ▼
                  ┌──────────────────────────────────────────────┐
                  │         PostgreSQL Database                  │
                  │  (Untrusted Storage / Zero Plaintext)        │
                  ├──────────────────────────────────────────────┤
                  │ users.name          -> iv:tag:ciphertext     │
                  │ users.phone         -> iv:tag:ciphertext     │
                  │ users.phone_hash    -> HMAC-SHA256 (Search)  │
                  │ statement_drafts    -> iv:tag:ciphertext     │
                  │ transactions.desc   -> iv:tag:ciphertext     │
                  │ chat_messages       -> iv:tag:ciphertext     │
                  │ bills & line items  -> iv:tag:ciphertext     │
                  └──────────────────────────────────────────────┘
```

### Encryption Primitives
- **Algorithm**: `AES-256-GCM` (authenticated encryption with associated data).
- **IV / Nonce**: 96-bit (12 bytes) cryptographically random nonce generated uniquely per encryption.
- **Auth Tag**: 128-bit (16 bytes) authentication tag validating integrity and preventing tampering or ciphertext manipulation.
- **Serialization Format**: Hex string `"${iv}:${authTag}:${ciphertext}"` (compatible with `crypto.js`).
- **Blind Indexing for Searchable PII**:
  - Exact lookups (e.g. looking up a user by phone during incoming WhatsApp webhooks) must not require plaintext phone numbers in the database.
  - We store `phone_hash = HMAC-SHA256(normalizePhoneNumber(phone), HMAC_KEY)`.
  - The database only ever indexes an irreversible HMAC digest; the raw phone number is never in plaintext.

---

## 3. Scope of Sensitive Fields to Encrypt

| Table | Sensitive Field(s) | Encryption Strategy | Search/Query Capability |
|---|---|---|---|
| `users` | `name`, `phone` | AES-256-GCM hex string | `phone_hash` (HMAC-SHA256) for exact match lookup during WhatsApp auth/upload |
| `statement_drafts` | `payload` | AES-256-GCM serialized JSON string | Read by `statement_id`, decrypted in memory during preview & confirmation |
| `transactions` | `description` | AES-256-GCM hex string | Decrypted in memory when queried by authenticated user; decrypted search filtering |
| `chat_messages` | `content`, `result` | AES-256-GCM hex string | Decrypted in memory on cursor pagination `chatHistory.page()` |
| `transaction_bills` | `merchant_name`, `file_name`, `payload` | AES-256-GCM hex string / serialized JSON | Decrypted when bill details or attachments are fetched |
| `transaction_line_items` | `description` | AES-256-GCM hex string | Decrypted when line items are fetched |
| `otp_codes` | `phone` | AES-256-GCM hex string + `phone_hash` | OTP verified via `phone_hash` index |
| `whatsapp_conversations` | `phone` | AES-256-GCM hex string + `phone_hash` | Mapped via `user_id` and `phone_hash` |

---

## 4. Implementation Details

1. **Zero-Downtime Migration**:
   - `safeDecrypt(val)`: Transparently decrypts strings formatted as `iv:tag:ciphertext`. If an unencrypted legacy string is passed, it returns the string unchanged.
   - Batch migration script `backend/scripts/migrate-encrypt-sensitive-data.js` encrypts existing plaintext records and populates `phone_hash`.

2. **Query Isolation**:
   - SQL operations requiring mathematical aggregation (`SUM(amount)`, `GROUP BY month`, `date >= ?`) continue to operate on numeric and date primitives.
   - Text narratives, personal descriptions, and draft payloads are never exposed to database administrators or leaked dumps.

---

## 5. Verification & Security Validation

1. **Automated Cryptographic Test Suites**:
   - `backend/test/crypto.test.js`: Validates AES-256-GCM authenticated encryption/decryption, tamper detection via auth tags, JSON encryption, blind indexing with HMAC-SHA256, and backward-compatible `safeDecrypt`. (9/9 passing)
   - `backend/test/sensitive-data-encryption.test.js`: Direct PostgreSQL level assertions proving raw rows contain only ciphertexts (`iv:tag:data`) and zero plaintext sensitive data. (9/9 passing)
   - `backend/test/whatsapp-integration.test.js`: Confirms blind index exact lookups for WhatsApp webhook routing, OTP validation, and statement draft ingestion. (8/8 passing)
   - `backend/test/user-data-export.test.js`: Confirms that decrypted exports (JSON & PDF) and GDPR compliance reports cleanly retrieve decrypted records for authorized users. (3/3 passing)
   - `npm test --workspace=backend`: All 175 tests pass with 0 failures.

2. **Quality Gates Passed**:
   - Mobile TypeScript (`npx tsc --noEmit --project mobile/tsconfig.json`): 0 errors.
   - Frontend Production Build (`npm run build --workspace=frontend -- --webpack`): Compiled and optimized 17/17 routes successfully.
   - Linting (`npm run lint`): 0 errors, 0 warnings across all workspaces.
   - Code Style (`npm run format:check`): 100% Prettier compliant.

