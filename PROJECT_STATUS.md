# Project Status & Progress Tracking

**Last Updated:** 2026-08-23
**Current Phase:** 3.6 - Polish & Testing (IN PROGRESS)
**Quality Infrastructure:** ✅ ESLint + Prettier + Pre-commit Hooks + GitHub Actions + SonarCloud + Tests

> This file had drifted well behind the code — it described Phases 3.3-3.6 as
> "Not started" while all of them had shipped. It was rewritten on 2026-08-23
> against the actual state of the repository at commit `2ef723d`.

---

## Phase Completion Status

### ✅ Phase 3.1: Setup & Auth (Week 1) - COMPLETE

- [x] Next.js project structure
- [x] PostgreSQL setup
- [x] Email/password auth
- [x] JWT middleware
- [x] User profile pages
- [x] OTP login by email (added after the original plan)
- [x] Password reset by OTP, with attempt rate limiting

**Not done:** Google OAuth. `GOOGLE_*` variables exist in `.env.example` and a
callback URL is reserved, but no route implements the flow and `next-auth` is
installed without being used. Either implement it or drop the dependency.

---

### ✅ Phase 3.2: File Upload & Parsing (Week 2) - COMPLETE

- [x] Upload endpoint with 10 MB limit, PDF/Excel only
- [x] Transaction extraction and storage
- [x] Statement audit trail with per-stage progress
- [x] Frontend upload form, statement list, per-statement detail
- [x] Background processing that resumes after a server restart

**Superseded:** the hand-written `icici.js`, `hdfc.js`, and `axis.js` parsers are
no longer called by any route — `generic.js` handles every bank via the AI
provider. The three files and the `test-parser*.js` scripts at the backend root
are dead code awaiting removal.

---

### ✅ Phase 3.3: AI Integration (Week 2-3) - COMPLETE

- [x] Provider abstraction supporting both Claude and Gemini (`services/ai.js`)
- [x] Generic statement parser driven by a structured-output schema
- [x] Batch categorization endpoint
- [x] API error handling, retries, and request timeouts
- [x] Malformed-JSON repair via `jsonrepair`
- [x] Per-request provider selection from the frontend

See `backend/PHASE_3.3_IMPLEMENTATION.md`.

---

### ✅ Phase 3.4: Dashboard & Analytics (Week 3) - COMPLETE

- [x] Transaction table with filters (ag-grid)
- [x] Pie chart - spending by category
- [x] Bar chart - monthly income vs expenses
- [x] Trends endpoint - month-over-month
- [x] Summary stats widget
- [x] Manual category editing

---

### ✅ Phase 3.5: Custom Categories (Week 4) - COMPLETE

- [x] Category CRUD with per-user defaults seeded on first use
- [x] Sub-categories via `parent_id`
- [x] Case-insensitive uniqueness per parent
- [x] Bulk reassignment of transactions between categories

---

### 🚧 Phase 3.6: Polish & Testing (Week 4-5) - IN PROGRESS

- [x] Error handling for failed uploads and API timeouts
- [x] Loading skeletons, toasts, error boundary
- [x] Mobile-responsive layout
- [x] **Backend unit tests** (`node:test`, runs in CI)
- [ ] Integration tests against a live database
- [ ] E2E tests
- [ ] Security fixes from the 2026-08-23 audit (see below)
- [ ] Dependency vulnerability remediation
- [ ] User testing & feedback loop

---

## Open Issues

Findings from the audit of 2026-08-23, highest severity first. Full detail and
reproduction steps are in `SECURITY_AND_QUALITY_AUDIT.md`.

### Security

| # | Issue | Severity |
| --- | --- | --- |
| 1 | `POST /api/auth/verify-otp` has no rate limiting; a 6-digit OTP is brute-forceable inside its 5-minute window and yields a 7-day JWT | Critical |
| 2 | OTPs are generated with `Math.random()`, which is predictable | High |
| 3 | `POST /api/auth/send-otp` is unauthenticated and unthrottled — email bombing at your SendGrid cost | High |
| 4 | Failed payment verification updates rows by `razorpay_order_id` with no `user_id` filter, letting one user mark another's payment failed | High |
| 5 | `POST /api/auth/login` has no rate limiting | Medium |
| 6 | `check-email` and `forgot-password/send-otp` disclose account existence and the account holder's name | Medium |
| 7 | Razorpay signature compared with `===` rather than a timing-safe comparison | Medium |
| 8 | `createOrder` feature-id guard bypassed by inherited `Object` keys | Medium |
| 9 | Upload file type validated by filename extension only, not content | Medium |
| 10 | No password strength requirement at registration (reset requires 8 chars; register requires none) | Medium |
| 11 | JWTs cannot be revoked; a password reset leaves existing sessions valid for up to 7 days | Medium |
| 12 | No global Express error handler, so unhandled route errors return stack traces | Low |

### Correctness

| # | Issue | Severity |
| --- | --- | --- |
| 13 | Transaction dates shift one day back on servers in timezones behind UTC, misfiling month-boundary transactions in analytics | High |
| 14 | Emails are matched case-sensitively, so `User@x.com` and `user@x.com` become separate accounts | Medium |
| 15 | `limit`/`offset` on `GET /api/transactions` are unvalidated — non-numeric values 500, and there is no maximum | Medium |
| 16 | AI-supplied `transactionIndex` is used as an array index with no lower bound; a negative value fails the whole statement | Medium |
| 17 | Re-uploading the same statement silently duplicates every transaction | Medium |
| 18 | `/analytics/trends` ignores `ai_suggested_category`, so it disagrees with `/analytics/pie` on the same data | Low |
| 19 | Statements over ~10,900 transactions exceed Postgres's parameter limit in the bulk insert | Low |
| 20 | `resetOtpAttempts` map grows without bound and is per-process | Low |

### Dependencies

`npm audit` reports 16 vulnerabilities (1 critical, 11 high). Notably:

- **`next-auth`** — critical advisory, and the package is not used anywhere.
  Removing it resolves the only critical finding.
- **`xlsx`** — prototype pollution and ReDoS, **no fix available** from the
  registry. Needs migration to a maintained fork or an alternative reader.
- `next`, `multer`, `axios`, `nodemailer`, `form-data` — all have fixes available.

### Tooling

- `SonarSource/sonarcloud-github-action@master` is pinned to a mutable ref;
  pin to a release tag or commit SHA.
- `backend/test-parser*.js` and `create-test-*.js` are ad-hoc scripts at the
  backend root that predate the real test suite.

---

## Environment Status

- **Backend:** `npm run dev` in `backend/`, port 3001
- **Frontend:** `npm run dev` in `frontend/`, port 3000
- **Database:** PostgreSQL 16, `financeanalytics` on localhost:5432
- **Node:** 22.x (CI matches; `node --test` globs need 21+)
- **GitHub:** https://github.com/shreegovinda/financeanalytics (default branch `master`)

Schema is applied automatically on server start by `backend/db/init.js`.

---

## Next Steps

1. Fix audit items 1-4 — these are the ones that are exploitable today.
2. Remove `next-auth` and run `npm audit fix`; plan the `xlsx` migration.
3. Fix the timezone bug (item 13) and un-`todo` its test.
4. Delete the dead bank parsers and root-level test scripts.
5. Add integration tests covering upload → parse → analytics against a real DB.

---

## Quality Infrastructure

### Completed

- [x] ESLint (flat config, `--max-warnings 0`) for backend and frontend
- [x] Prettier
- [x] Pre-commit hooks with husky + lint-staged
- [x] GitHub Actions on every PR: lint, format check, tests
- [x] PR template with the code review checklist
- [x] Branch naming convention (`GIT_WORKFLOW.md`)
- [x] SonarCloud, skipped gracefully when no token is configured
- [x] Backend test suite (`npm test`)

### Commands

```bash
npm run lint              # check both workspaces, fails on any warning
npm run lint:fix          # auto-fix
npm run format            # auto-format
npm run format:check      # verify formatting
npm test                  # backend test suite
```

---

## Code Review Checklist (Applied Before Every Commit)

- [ ] Security: No credentials/secrets exposed
- [ ] Security: No injection vulnerabilities (SQL, XSS, etc.)
- [ ] Security: Queries touching user data filter by `user_id`
- [ ] Code Quality: Naming conventions followed
- [ ] Code Quality: Structure matches project patterns
- [ ] Performance: No obvious bottlenecks introduced
- [ ] Error Handling: Proper try/catch and validation
- [ ] Backwards Compatibility: Changes don't break existing flow
- [ ] Alignment: Changes match SDLC plan & design docs
- [ ] ESLint passes (0 warnings/errors)
- [ ] Prettier formatting enforced
- [ ] Tests pass, and new logic is covered
