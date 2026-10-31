# Finlytix — Target Architecture

**Status:** Proposal · **Date:** 2026-10-27
**Relationship to `ARCHITECTURE.md`:** that document describes the system *as it is*. This one describes where to take it and in what order. Debt IDs (TD-xx) refer to its Technical Debt Register.

## 1. Where we are, and the forces on the design

Observed in the code:

- One Express 5 process (`backend/server.js`) mounts ~20 route modules. Business logic lives inside routes (`routes/upload.js` 1,181 lines, `routes/auth.js` 1,178), with services beside them.
- Statement processing runs **in-process** via `setImmediate`, with `resumeProcessingStatements()` replaying unfinished work at boot. It survives a restart but cannot scale out, has no retry/backoff, and competes with API traffic for CPU and memory.
- Schema is one idempotent `schema.sql` applied on boot (no versioned migrations). 22 tables, all user-owned.
- AI is already behind a provider router (`services/ai.js`, `aiUseCases.js`, `aiValidation.js`) with per-use-case config and BYOK keys. This is the strongest seam in the codebase.
- Three clients (Next.js web, Expo mobile, WhatsApp webhook) share `@finlytix/shared`.
- Sensitive data: AES-256-GCM at rest, statement files encrypted, 2FA, token-version revocation.

Forces that drive the design:

| Force | Consequence |
|---|---|
| Single small team, one deployable today | Stay a **modular monolith**; do not split into microservices |
| Untrusted file uploads parsed by `xlsx`/`pdf-parse` + LLMs (TD-02, TD-12) | Isolate parsing in a worker with limits |
| Financial PII, India-first (DPDP/GDPR-style closure & export already built) | Defence in depth, tenant isolation enforced in one place |
| Multiple AI vendors, user-supplied keys | One gateway with redaction, metering, failure isolation |
| Three channels needing the same capabilities | Channel-agnostic application layer; channels are thin adapters |

## 2. Architectural style

**Modular monolith, two process types, one codebase, one database.**

```
                    ┌────────────────────────── CLIENTS ──────────────────────────┐
                    │  Web (Next.js)     Mobile (Expo)      WhatsApp (webhook)    │
                    └──────┬──────────────────┬───────────────────┬───────────────┘
                           │  HTTPS / JSON    │                   │ signed webhook
                    ┌──────▼──────────────────▼───────────────────▼───────────────┐
                    │  EDGE: TLS · CORS · rate limit · request-id · size limits   │
                    └──────────────────────────┬──────────────────────────────────┘
                                               │
 ┌─────────────────────────────────────────────▼─────────────────────────────────────────┐
 │ API PROCESS (stateless, N replicas)                                                   │
 │                                                                                       │
 │  Interface layer   routes → validate (schema) → authn/authz → call use case          │
 │  ─────────────────────────────────────────────────────────────────────────────────── │
 │  Application layer  use cases / services (no HTTP, no SQL strings)                    │
 │                                                                                       │
 │   ┌──────────┐ ┌────────────┐ ┌────────┐ ┌──────────┐ ┌───────────┐ ┌──────────────┐  │
 │   │ Identity │ │ Statements │ │ Ledger │ │ Insights │ │ Assistant │ │ Compliance   │  │
 │   │ auth,2FA │ │ upload,    │ │ txns,  │ │ analytics│ │ chat,voice│ │ consent,     │  │
 │   │ profile  │ │ draft,     │ │ cats,  │ │ health   │ │ whatsapp  │ │ export,      │  │
 │   │ sessions │ │ review     │ │ bills  │ │ score    │ │ handler   │ │ closure,audit│  │
 │   └──────────┘ └─────┬──────┘ └────────┘ └──────────┘ └─────┬─────┘ └──────────────┘  │
 │   ┌──────────┐       │                                      │        ┌──────────────┐ │
 │   │ Billing  │       │                                      │        │ Admin        │ │
 │   └──────────┘       │                                      │        └──────────────┘ │
 │  ─────────────────────────────────────────────────────────────────────────────────── │
 │  Platform layer   AI Gateway · Crypto/KeyRing · Mailer · Payments · Job queue · Logger│
 │  Persistence      repositories (all queries scoped by user_id)                        │
 └─────────────────────┬─────────────────────────────────────┬───────────────────────────┘
                       │ enqueue                             │ SQL
 ┌─────────────────────▼─────────────────┐        ┌──────────▼──────────────┐
 │ WORKER PROCESS (same repo, same image)│        │ PostgreSQL              │
 │  ingest.parse · ingest.categorize     │◄──────►│  app tables + job queue │
 │  export.build · email.send            │        │  (SKIP LOCKED)          │
 │  retention.sweep · whatsapp.reply     │        └──────────┬──────────────┘
 └─────────────────────┬─────────────────┘                   │
                       │                          ┌──────────▼──────────────┐
                       └─────────────────────────►│ Object storage (S3-compat)│
                         AI Gateway ──► providers │ encrypted statement files │
                                                  └─────────────────────────┘
```

Rules that keep the monolith modular (enforce with `eslint-plugin-import` boundaries, which the repo already has):

1. Modules talk through each other's **public service interface** (`modules/ledger/index.js`), never into another module's repositories or tables.
2. Only repositories write SQL; every repository function takes `userId` as a required argument. This is the single place tenant isolation lives.
3. Routes contain no business logic. Target: no route file over ~150 lines.
4. Channels (web, mobile, WhatsApp) call the same use cases. `whatsappChatHandler` and `routes/chat.js` should both call `assistant.answer()`.

Proposed backend layout:

```
backend/src/
  app.js  server.js  worker.js
  modules/
    identity/    {routes, service, repo, schemas}
    statements/  {routes, service, repo, pipeline/, parsers/, schemas}
    ledger/      insights/   assistant/   billing/   compliance/   admin/   channels/whatsapp/
  platform/
    ai/          gateway, providers/, catalogue, usecases, validation
    crypto/      keyring, envelope encryption
    queue/       enqueue, worker loop, retry policy
    http/        error handler, rate limit, request-id, auth middleware
    mail/ payments/ storage/ logger/ config/ (validated env)
  db/migrations/  0001_baseline.sql …
```

Migration is incremental: move one module at a time behind its existing route paths, so API contracts do not change.

## 3. Key design decisions

### 3.1 Durable ingestion pipeline (highest value)

Replace `setImmediate` + boot-time resume with a **Postgres-backed job queue** (`pg-boss` or a small `FOR UPDATE SKIP LOCKED` table). No Redis: one fewer moving part, jobs commit transactionally with the statement row.

```
POST /upload ─► validate (size, magic bytes, per-user in-flight lock)
             ─► store encrypted file ─► INSERT statement(status=uploaded) + enqueue ingest.parse   [one tx]
             ─► 202 {statementId}

worker: ingest.parse ──► sandboxed parse (timeouts, memory cap, page/row caps)
                     ──► deterministic parser per bank → LLM extraction fallback → schema-validate
                     ──► INSERT statement_draft ─► status=pending_review
user confirms ─► tx: insert transactions (batched, chunked under PG param cap) ─► enqueue ingest.categorize
worker: ingest.categorize ──► rules/merchant cache first → AI for the remainder → write ai_suggested
```

State machine (single source of truth, enforced in `statements/service`):

```
uploaded → parsing → pending_review → confirming → categorizing → complete
              │            │                                          
              └─► failed ◄─┘     pending_review → discarded      any → deleted
```

- Retries with exponential backoff and a dead-letter state surfaced to the user as "failed – retry".
- Idempotency key per statement + (user, bank, month) uniqueness already exists (`ensureMonthNotAlreadyUploaded`); keep it as a DB constraint, not just a check.
- Progress reporting (`updateProgress`) stays; clients poll now, upgrade to SSE later.
- Fixes TD-02 (parser isolation — run the `xlsx` read in a child process / worker thread with limits; evaluate replacing it), TD-12 (magic bytes), TD-19 (chunked inserts).

### 3.2 AI Gateway

Formalise what `services/ai.js` already does into one port:

```
assistant / ingest / insights ──► AiGateway.run({useCase, userId, input, schema})
                                      │ 1. resolve connection (user BYOK → platform key), per use case
                                      │ 2. redact PII not needed by the task (account no., phone, names)
                                      │ 3. enforce budget/quotas, record tokens & cost (costTransparencyService)
                                      │ 4. call provider adapter with timeout + circuit breaker + fallback
                                      │ 5. validate structured output (aiValidation); one repair attempt
                                      ▼
                      adapters: gemini · claude · openai · groq · deepseek · mistral
```

- Adapters implement one interface (`complete`, `stream`, `structured`); adding a vendor is one file plus a catalogue entry.
- Treat model output as untrusted: schema-validate before it touches the ledger; never let it choose SQL, user ids, or tools beyond a fixed allow-list.
- Chat context is built from **pre-aggregated, user-scoped queries** (`chatData`), not raw table dumps, to bound tokens and leakage.
- Voice stays a client concern (Web Speech API); the server only sees text.

### 3.3 Data architecture

- **Versioned migrations** (`node-pg-migrate` or similar) replace boot-time `schema.sql`. Baseline the current schema as `0001`; CI applies migrations to an empty DB and diffs against expectations. Boot no longer mutates the schema; deploy runs migrations as a separate step.
- **Money**: store `NUMERIC(14,2)` or integer minor units plus ISO currency code; never floats. Confirm the existing `transactions` columns meet this before the multi-currency work (`exchangeRateService`) goes further.
- **Case-insensitive unique email** (`citext` or lower-cased unique index) — TD-14.
- **Statement files** move from DB rows to object storage with envelope encryption: a per-file data key wrapped by a versioned master key (`KeyRing`), so keys can be rotated without re-reading everything. Keep `statement_files` as metadata (path, key id, checksum).
- **Encryption key versioning**: prefix ciphertext with key id; rotation job re-wraps lazily. Builds on `plans/05-sensitive-data-encryption-at-rest.md`.
- **Analytics**: start with indexed live queries `(user_id, txn_date)`, `(user_id, category_id, txn_date)`. Add a `monthly_category_totals` summary table, refreshed by the categorize job, when p95 of `/analytics/*` exceeds ~300 ms. Also resolves TD-20 by defining "uncategorized" once, in the Insights module.
- **Defence in depth for tenancy**: after repositories are the only SQL path, add Postgres **row-level security** keyed on `SET LOCAL app.user_id` per request transaction. A missed `WHERE user_id` then fails closed.
- **Retention**: scheduled sweep for expired OTPs/tokens, discarded drafts, closed-account data (account closure and export already exist; move heavy ones into jobs).

### 3.4 Security architecture

Already strong: AES-GCM, 2FA, token versioning, consent records, crash-report redaction. Gaps to close by design rather than patch:

| Concern | Design |
|---|---|
| Brute force / abuse (TD-03, TD-05, TD-07) | One `rateLimit` middleware, store in Postgres (or Redis later) so limits hold across replicas; keyed by IP + account; applies to login, OTP, 2FA, password change, chat |
| Error leakage (TD-04) | Global error handler: typed `AppError` → stable `{code, message, requestId}`; stack only in logs |
| Account enumeration (TD-06) | `check-email` returns a uniform response; verification flow carries the distinction |
| Sessions | Short-lived access token + rotating refresh token; web in `httpOnly; Secure; SameSite` cookies, mobile in SecureStore (already present). `token_version` remains the global revoke switch |
| Webhooks (TD-10) | Raw-body signature check with `timingSafeEqual` for Razorpay and WhatsApp; replay window; idempotent handlers keyed by event id |
| Input | Schema validation (zod, shared with the client via `@finlytix/shared`) at every route boundary — also fixes TD-11, TD-15 |
| Config | `platform/config` validates env at boot and fails fast; no scattered `process.env` reads |
| Supply chain | Remove unused `next-auth` (TD-01) and `crypto` shim (TD-18); Dependabot + `npm audit` gate in CI; pin actions by SHA (TD-17) |
| Secrets & BYOK | User AI keys stay encrypted, are never returned to clients, never logged; redaction already in `utils/redact.js` |
| Audit | `activity_logs` becomes append-only and written from one `audit.record()` call in use cases, not routes |

### 3.5 API and contracts

- Keep REST + JSON; version under `/api/v1` when the first breaking change is needed.
- Make `shared/src/api/contracts.ts` the **source of truth**: zod schemas → TypeScript types for both clients → request validation on the server → generated OpenAPI for docs. This removes drift between web, mobile and backend.
- Uniform pagination (`limit` capped, cursor for transactions), uniform error envelope, `Idempotency-Key` on payment and upload endpoints.
- JSON body limit: 50 MB globally is too generous; set ~100 KB default and raise only on the upload route (multipart, streamed).

### 3.6 Frontend and mobile

- **Web (Next.js App Router):** server components for static/legal/help pages; keep dashboard pages client-rendered behind the auth guard. Zustand for session/UI state only; server data via a query cache (TanStack Query) so statement-progress polling, refetch-after-confirm (`financeRefresh.ts`) and optimistic edits stop being hand-rolled.
- **Mobile:** reuse `shared` for types, formatters, contracts; same API client shape. Biometric unlock wraps the stored refresh token, not the password.
- **WhatsApp:** adapter only: verify signature → resolve phone→user → call `statements.ingest` / `assistant.answer` → enqueue reply. Phone verification and consent gate every action.
- Add tests where there are none: component tests for statement review and auth, Playwright E2E for the core journey (register → verify → upload → review → confirm → dashboard → ask assistant).

### 3.7 Observability and operations

- Structured JSON logs (`pino`) with `requestId`, `userId` (hashed), `jobId`; the existing redaction rules apply to log serialisers.
- Metrics: request latency/error rate, queue depth and age, job duration by type, parse failure rate by bank, AI latency/cost/error by provider and use case.
- Error tracking (Sentry or equivalent) with the same redaction as `crash_reports`.
- Health: `/health/live` (process) and `/health/ready` (DB, queue, storage). Replace the current static `{status}` response.
- Alerts: queue age > 5 min, parse failure rate spike, AI provider error rate, auth failure spike.

## 4. Deployment topology

```
 Vercel (web)  ─────►  API service (container, ≥2 replicas)  ─────►  Managed Postgres (PITR backups)
 Expo/EAS (mobile) ─►        │                                          ▲
 Meta WhatsApp ─────►        │ enqueue                                  │
                       Worker service (container, 1–N)  ────────────────┘
                             │                    └────► Object storage (SSE + app-level envelope)
                             └──► AI providers · Razorpay · Mail provider
```

- Environments: local → preview (per PR, ephemeral DB) → staging → production. Same container image everywhere; config via env only.
- CI/CD: existing lint/format/test/build jobs, plus migration check against a fresh DB, `npm audit`, container build, and smoke test on staging before promote. Migrations run as a pre-deploy step and must be backward-compatible with the previous release (expand → migrate → contract).
- Region: keep DB, storage and API co-located in an Indian region for latency and data-residency posture.
- Scale levers in order: more API replicas → more workers → read replica for analytics → summary tables → only then consider extracting a service.

## 5. Decisions and trade-offs

| # | Decision | Alternative | Why this | Revisit when |
|---|---|---|---|---|
| D1 | Modular monolith | Microservices | One team, one DB, strongly transactional domain; modules keep the extraction path open | A module needs independent scaling or a separate team |
| D2 | Postgres-backed queue | Redis/BullMQ, SQS | Transactional enqueue, no new infra, volume is low (statements, not events) | >~100 jobs/s or need for fan-out/delays at scale |
| D3 | Worker is the same codebase | Separate repo/service | Shares modules, one deploy artifact | Parsers need a different runtime (e.g. Python OCR) |
| D4 | Object storage for files | Keep files in PG | Smaller DB/backups, cheaper streaming, easier retention | Never worth reversing; migrate with a one-off job |
| D5 | Zod contracts in `shared` | OpenAPI-first codegen | Types and runtime validation from one definition in a TS+JS monorepo | Third-party API consumers appear |
| D6 | RLS as a second tenancy layer | Repo discipline only | Fails closed on human error | If RLS cost shows in profiling (unlikely at this size) |
| D7 | Gateway with redaction + fallback | Direct SDK calls per feature | Consistent cost, safety and failure handling across 6 vendors | — |

## 6. Phased roadmap

Each phase ships independently and leaves the API contract unchanged.

| Phase | Theme | Deliverables | Closes |
|---|---|---|---|
| **0** (≈1 wk) | Hardening quick wins | Global error handler; rate-limit middleware on auth/OTP; body limits; magic-byte upload check; `timingSafeEqual`; remove `next-auth` & `crypto`; uniform `check-email`; limit/offset validation | TD-01,03,04,05,06,07,10,11,12,13,15,18 |
| **1** (≈2 wk) | Foundations | Versioned migrations (baseline `0001`); validated config; structured logging + request id; health/ready; `src/` layout with import-boundary lint rule; remove dead parsers | TD-16,17, migration debt |
| **2** (≈3 wk) | Durable ingestion | Job queue + worker process; statement state machine; retries/DLQ; chunked inserts; sandboxed parse; email & export as jobs | TD-02,19 |
| **3** (≈3 wk) | Modularise & contracts | Extract Identity, Statements, Ledger, Insights, Assistant into modules (routes become thin); zod contracts shared with web/mobile; repositories require `userId`; case-insensitive email | TD-14,20 |
| **4** (≈2 wk) | AI Gateway & assistant unification | Single gateway entry; cost metering and quotas; WhatsApp + web chat share `assistant.answer`; provider fallback/circuit breaker | — |
| **5** (≈3 wk) | Storage, keys, tenancy | Object storage + envelope encryption + key rotation; RLS; retention jobs | encryption roadmap |
| **6** (ongoing) | Quality & scale | Component + Playwright E2E tests; monthly summary table; SSE progress; staging promote gate; dashboards & alerts | TD-08,09 |

Phase 0 and 1 are low-risk and should go first; Phase 2 delivers the largest reliability gain; Phases 3–5 are refactors best done one module at a time with the existing 40+ backend tests as the safety net.

## 7. Open questions

1. Expected scale in 12 months (users, statements/month)? It decides whether Phase 6's summary tables and read replica are needed early.
2. Is data residency in India a hard requirement? It constrains the choice of Supabase/Railway/Vercel regions and AI providers receiving statement text.
3. Should the platform offer a default AI key (with cost quotas), or stay BYOK-only for some tiers? This shapes the gateway's budget logic.
4. Are statements ever parsed by a **third-party LLM** with the raw account number/name? If so, redaction before send should be a Phase 2 requirement, not Phase 4.
5. The `.claude/launch.json` and existing docs assume Supabase/Railway/Vercel; confirm these, since D4 depends on the storage provider.

*Caveat: this design is based on the repository layout, `server.js`, `routes/upload.js`, `schema.sql` table list, `package.json` files and the existing `ARCHITECTURE.md`. I did not read every route or service line by line, so module boundaries in §2 and the Phase 0 checklist should be confirmed against the code as each phase starts.*
