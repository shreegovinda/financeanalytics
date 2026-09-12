# Ask Finlytix

Open /assistant or choose Ask Finlytix from an authenticated app page.
The chat is read-only and uses the existing configured AI provider.
Relevant user-owned data is sent to that provider; the interface discloses this.
Conversation history is persisted per user in PostgreSQL.

The first model request selects up to three allowlisted retrieval tools.
The backend validates filters and binds the authenticated user ID itself.
Tools run in a repeatable-read, read-only database transaction with a five-second
statement timeout. They expose explicitly selected business fields, never
password hashes, OTPs, tokens, API keys, payment signatures or raw files.
No model-generated SQL is executed. Strings in records are treated as untrusted
data, and links are generated from server-known source IDs.

Finance totals cover all matching transactions. Transaction detail is limited to
50 rows, grouping to 100 groups, statement history to 200 rows and bills/payments
to 50 rows. Answers must disclose these bounds and missing statement coverage.
Questions should be narrowed by bank, period, merchant or category for detail.
Database totals are shown separately from the model's explanation for verification.
AI explanations are not guaranteed correct; verify against the linked records.

Product knowledge is maintained in backend/services/productGuide.js. Update it
with product changes. It distinguishes implemented features from planned ones.
The backend makes two AI calls per question and retries a temporary provider
502/503/504 error once. Concurrent questions from one user are rejected.
Quota exhaustion and provider downtime produce a user-visible retry message.

Validation:
- npm test (unit suite; integration tests are opt-in)
- RUN_LOCAL_DB_TESTS=1 node --test backend/test/chat-isolation.integration.test.js
  Uses temporary fictional users and deletes only its fixtures.
- npm run lint
- npm run build --workspace=frontend

Cloud follow-ups: distributed per-user rate limits, cancellation propagation,
server-held conversation IDs if persistence is required, and broader evaluation
of answer accuracy. Current conversation history is untrusted client input.

## Saved history
Conversations and supporting evidence persist per user. The latest 100 messages load first; Load older messages uses a stable sequence cursor. Delete saved history permanently removes messages. A database-locked history version prevents in-flight answers from recreating deleted messages across app instances. Failed AI requests are not stored. History loading and deletion errors are shown with retry controls.
