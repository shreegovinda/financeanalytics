# Finlytix platform roadmap and Antigravity handoff

This is the working project to continue:

`/Users/shreegovinda/Desktop/Projects/financeanalytics`

Use this Desktop checkout as the source of truth. The older Codex checkout was moved into the ignored recovery folder:

`/Users/shreegovinda/Desktop/Projects/financeanalytics/.local-migration-backup/codex-checkout`

Never commit `.local-migration-backup/`, `.env*`, SMTP credentials, Gemini keys, database dumps, uploaded statements, or generated private reports.

## Current handover — 24 September 2026

Continue from `feature/assistant-conversations-ai-connections` in this Desktop checkout.

- Open PR: https://github.com/shreegovinda/financeanalytics/pull/42 (base: `master`).
- Implementation commit: `55a7494`.
- Previous PR #41 is merged. Do not continue on its old branch.
- Read [ANTIGRAVITY_HANDOVER.md](ANTIGRAVITY_HANDOVER.md) first for the current implementation, validation, and next actions.
- The sections below are the historical platform roadmap from the earlier handoff. They are not a current inventory of uncommitted work or proof of implementation. Reconcile them against code before choosing more work.

## Historical platform phase

The earlier `feature/account-privacy-platform` work was subsequently merged through PR #40. Historical notes below are retained for context.

## Current local changes already made

- GoDaddy SMTP configuration for `admin@finlytix.in` was copied from the old Codex checkout into the Desktop backend environment while preserving the Desktop database settings.
- SMTP authentication was verified, and a test email from `admin@finlytix.in` to itself was accepted by the provider.
- `.local-migration-backup/` was added to `.gitignore`.
- Signup now requires a mobile number in international E.164-style syntax, for example `+919876543210`.
- Backend registration validates the required mobile number and stores the trimmed value.
- Statement preview copy now correctly says the statement and extracted transactions are saved as a draft.
- Statement preview has a `Review later` action that returns the user to the statements page.
- A product FAQ source was added at `backend/data/faqs.json`.
- The chatbot product guide now uses the FAQ source.
- A public help page was added at `frontend/app/help/page.tsx`.
- Help links were added from the home page and assistant page.
- Chatbot tests were updated so the product knowledge answers mention saved draft review and current security limitations.

## Validation already run

- `node --test backend/test/chat.test.js` passed.
- `npm run lint` passed.
- `git diff --check` passed.
- Backend and frontend Prettier checks passed after formatting.
- A previous broader backend test run passed with 112 total tests, 109 passed, 3 skipped.

One production frontend build was still running when this handoff was last updated. Re-run the build before committing:

```sh
npm run build --workspace=frontend -- --webpack
```

## Requested product scope

1. Send real emails from `admin@finlytix.in`.
2. Save uploaded statements and extracted draft transactions so users can return later to review and approve.
3. Make mobile number mandatory during signup.
4. Support mobile, tablet, and desktop layouts.
5. Support major desktop browsers, iOS and Android browsers, and common embedded social-media browsers.
6. Prepare the architecture for future global currencies and multiple languages.
7. Let users choose from admin-approved AI providers/models or use their own API key at their own cost.
8. Add FAQs and let the chatbot answer questions about the product, the user's data, security, privacy, safe technical details, and future plans.
9. Let users request a complete report of their data, including a readable PDF and full export material.
10. Let users permanently close/delete their account, deleting user data with clear minimal retention for legal/security purposes.
11. Encrypt sensitive data so database access alone cannot reveal it.
12. Add privacy policy, terms, cookie policy, and consent before signup.
13. Let users submit crash reports with useful redacted diagnostics.
14. Track minimal useful user/admin information for operations and support.

## Acceptance criteria by feature

### 1. Real email

- Backend uses SMTP in production-like local/dev settings.
- Auth OTP and app emails send from `admin@finlytix.in`.
- Email failures are visible to the user without exposing provider internals.
- Local development can still use console email deliberately when configured.
- `FRONTEND_URL`, backend port, and frontend API URL are aligned.
- Verify both SMTP provider acceptance and real inbox receipt before calling it done.

### 2. Deferred statement approval

- Original statement files and parsed draft transactions are retained.
- A user can upload, leave the review page, return later, review, edit, and approve.
- Pending drafts are excluded from analytics and transaction lists unless explicitly shown as pending.
- One statement per user, bank account, year, month, and file type is enforced while pending and after approval.
- Duplicate upload attempts give a clear error and point to the existing pending or approved statement.
- Deleting a statement deletes its related transactions, drafts, files, bill records, and derived data, then unblocks that bank/month.

### 3. Mandatory mobile number

- Client and server both require mobile number.
- Use international syntax with country code.
- Do not claim the number is verified until SMS OTP or a similar verification flow exists.
- Existing users without mobile numbers need a profile completion path.

### 4. Responsive UI

- Verify signup, dashboard, settings, statement upload, statement review, analytics, chatbot, and help pages at phone, tablet, and desktop widths.
- Use touch-friendly controls for mobile.
- Avoid horizontal overflow and clipped long bank names, file names, and chat content.
- Keep dense finance tables usable with wrapping, responsive columns, or mobile-friendly row layouts.

### 5. Browser support

- Test current Chromium, Firefox, and WebKit.
- Verify iOS Safari, Android Chrome, and embedded social/in-app browsers on real devices before claiming support.
- Confirm upload, preview, download, authentication, chatbot streaming or fallback, and PDF report download.
- Provide graceful fallbacks when embedded browsers block downloads, cookies, local storage, or file selection.

### 6. International foundation

- Store user locale, timezone, display currency, and preferred language explicitly.
- Store each statement's source currency.
- Do not sum across currencies unless an exchange rate, date, and source are recorded.
- Centralize number, date, month, and currency formatting.
- Keep all user-facing text ready for a translation catalogue instead of hardcoding scattered strings.

### 7. AI provider and key choice

- Admin can define allowed providers, models, labels, limits, and default options.
- User can select an admin-paid model or supply their own key/token.
- Personal keys must be encrypted server-side and never returned to the frontend.
- Users can remove personal keys.
- The app must never silently fall back from a user's personal key to an admin-paid key.
- Consent copy must clearly explain data transfer and cost responsibility for the selected provider.
- Provider calls must go only through allowlisted server-side adapters.

### 8. FAQ and chatbot product knowledge

- Keep one maintained product knowledge source.
- Chatbot can answer both finance questions and product questions.
- Product answers must distinguish shipped features from planned features.
- Do not expose secrets, internal credentials, stack traces, private logs, or raw operational details.
- FAQ content must stay honest about current limitations, especially encryption, retention, and account closure until implemented.

### 9. Data report

- User can request an authenticated export.
- Export includes profile data, bank accounts, statements, transactions, categories, bills, payments, chatbot history, consent records, and audit events owned by that user.
- Include record counts and provenance.
- Provide a readable PDF summary plus complete machine-readable records and applicable statement attachments.
- Explicitly exclude password hashes, tokens, other users' records, and secrets.
- Avoid silent truncation.

### 10. Account closure

- Require recent reauthentication before closure.
- Show a clear confirmation step.
- Delete user-owned data, files, drafts, transactions, chat history, personal AI keys, sessions, and refresh state.
- Increment token/session version so active sessions stop working.
- Keep only explicitly configured minimal legal/security records.
- Explain backup expiry and how deletion is enforced during restore.
- Do not invent indefinite retention under a vague legal exception.

### 11. Encryption

- Add application-level authenticated encryption for sensitive fields and original uploaded files.
- Encryption keys must be managed separately from the database.
- A database-only reader must not have decryption keys.
- Plan reversible migration and rollback before deleting plaintext.
- Preserve analytics correctness without leaking sensitive data through supposedly protected tables.
- Review uploads, draft parser output, approved transactions, chat history, reports, logs, and backups.

### 12. Policies and consent

- Add versioned privacy policy, terms, and cookie policy pages.
- Require explicit acceptance before signup completion.
- Store consent version, timestamp, IP/user-agent if policy allows, and user id.
- Legal business identity, support contact, governing terms, and retention periods must remain deployment settings until the owner supplies final details.
- Avoid optional tracking until there is explicit opt-in.
- Do not claim compliance certifications that have not been audited.

### 13. Crash reports

- Reports must be user-initiated.
- User can preview what will be sent.
- Redact credentials, bank data, statement text, request bodies, tokens, cookies, and authorization headers.
- Bound payload size and rate.
- Store enough context for debugging: app version, page, browser, device class, timestamp, user id, and recent client error summary.
- Admin access must be authenticated and role-gated.

### 14. Admin information

- Add explicit admin roles.
- Track minimal operational metrics such as user count, statement counts, pending review count, failed email count, failed parsing count, consent versions, and crash report count.
- Avoid routine admin access to raw financial details.
- Document purpose and retention for every collected admin field.

## Recommended implementation order

1. Finish the current local changes: run format, lint, backend tests, frontend build, and inspect the UI.
2. Normalize local app startup from the Desktop checkout so backend/frontend ports and CORS match.
3. Complete signup/profile phone handling for existing users.
4. Finish deferred statement review and duplicate upload behavior with integration tests.
5. Add consent pages and signup consent capture using configurable legal identity placeholders.
6. Add user profile preferences for locale, timezone, currency, and language.
7. Add AI provider catalogue and user selection without personal key storage first.
8. Add encrypted personal AI key storage after key-management design is in place.
9. Add user data export with PDF summary and machine-readable archive.
10. Add account deletion/closure with retention settings and tests.
11. Add crash report submission and admin operational dashboard.
12. Plan and implement encryption migration for sensitive records and statement files.
13. Run responsive and browser verification.
14. Prepare PR with a clear list of shipped features and planned follow-up work.

## Engineering guardrails

- Backend enforcement comes before UI claims.
- Every user-owned database query must be scoped by authenticated user id.
- Add integration tests for tenancy isolation, duplicate uploads, deletion cascade, account closure, and export scope.
- Keep legal and policy text configurable until business identity and retention details are finalized.
- Never log secrets, OTPs, AI keys, statement text, full request bodies, or uploaded file content.
- Do not make marketing claims such as "bank-grade security", "fully compliant", or "all browsers supported" unless the implementation and verification back them.
- Treat this file as a roadmap and handoff, not proof that every feature is implemented.

## Files to inspect first in Antigravity

- `backend/server.js`
- `backend/db/schema.sql`
- `backend/routes/auth.js`
- `backend/routes/upload.js`
- `backend/routes/chat.js`
- `backend/services/ai.js`
- `backend/services/chat.js`
- `backend/services/chatData.js`
- `backend/services/productGuide.js`
- `backend/data/faqs.json`
- `frontend/app/auth/page.tsx`
- `frontend/app/statements/page.tsx`
- `frontend/app/statements/[id]/preview/page.tsx`
- `frontend/app/settings/page.tsx`
- `frontend/app/assistant/page.tsx`
- `frontend/app/help/page.tsx`
- `frontend/lib/api.ts`
- `frontend/AGENTS.md`

## Final pre-PR checklist

- `npm run format:check --workspace=backend`
- `npm run format:check --workspace=frontend`
- `npm run lint`
- `npm test --workspace=backend`
- `npm run build --workspace=frontend -- --webpack`
- Verify local SMTP with a non-secret test email.
- Verify upload, review later, approve, download, preview, delete, and duplicate-month blocking in the browser.
- Verify help and chatbot FAQ answers.
- Confirm `git status` does not include `.env*`, `.local-migration-backup/`, uploaded statements, generated reports, or database dumps.
