# Project Status & Progress Tracking

**Last Updated:** 2026-08-23 (post PR #26-#32 merge)
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
- [x] **Backend unit tests** (`node:test`) — 41 tests, executed in CI
- [ ] Integration tests against a live database
- [ ] E2E tests
- [x] Critical and high security fixes (#26, #27, #29, #30, #31)
- [ ] Remaining security fixes from the 2026-08-23 audit (see below)
- [ ] Dependency vulnerability remediation
- [ ] User testing & feedback loop

---

## Open Issues

Findings from the 2026-08-23 audit. **7 of 20 code findings are now fixed**,
including the critical one. Full detail in `SECURITY_AND_QUALITY_AUDIT.md`.

### Fixed by #26-#31

| # | Issue | Was | Fixed in |
| --- | --- | --- | --- |
| A1 | OTP login brute-forceable into account takeover | Critical | #26 |
| A2 | OTPs generated with `Math.random()` | High | #26 |
| A4 | Payment records alterable across users | High | #26, #27 |
| B4 | Batch offset lost, so statements over 50 transactions were categorized onto the **wrong transactions** | High | #27 |
| B1 | Transaction dates drifted a day west of UTC, misfiling month boundaries | High | #31 |
| B5 | Re-uploading a statement duplicated every transaction | Medium | #30, #31 |
| A11 | Sessions survived password changes | Medium | #29 |

### Still open

| # | Issue | Severity |
| --- | --- | --- |
| A3 | `send-otp` unauthenticated and unthrottled | High |
| A5 | No rate limiting on `login` | Medium |
| A6 | `check-email` discloses account existence and holder's name | Medium |
| A7 | Razorpay signature compared non-timing-safely | Medium |
| A8 | Feature-id guard bypassed by inherited `Object` keys | Medium |
| A9 | Upload type validated by filename only | Medium |
| A10 | No password strength requirement at registration | Medium |
| B2 | Emails matched case-sensitively | Medium |
| B3 | `limit`/`offset` unvalidated on `GET /transactions` | Medium |
| A12 | No global Express error handler | Low |
| B6 | `/trends` and `/pie` disagree on uncategorized rows | Low |
| B7 | Bulk insert exceeds Postgres parameter cap above ~10,900 rows | Low |
| B8 | OTP attempt map unbounded and per-process | Low |

### Dependencies

`npm audit`: 16 vulnerabilities (1 critical, 11 high).

- **`next-auth`** — the only critical advisory, and unused anywhere in the
  frontend. Removing it is the highest value-per-effort item outstanding.
- **`xlsx`** — prototype pollution and ReDoS, **no upstream fix**, and it parses
  untrusted uploads. Needs migration.
- `next`, `multer`, `axios`, `nodemailer`, `form-data` — fixes available.

### Tooling

- `SonarSource/sonarcloud-github-action@master` is pinned to a mutable ref.
- Dead code: the three superseded bank parsers, the root-level `test-parser*.js`
  and `create-test-*.js` scripts, and the `crypto` dependency (the deprecated npm
  shim, not the builtin).

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

1. Remove `next-auth` and run `npm audit fix`; plan the `xlsx` migration.
2. Add rate limiting to `send-otp` and `login` (A3, A5) — no throttling
   middleware exists in the app yet.
3. Normalize email case (B2) before the account count grows.
4. Clear the small, well-understood items: A7, A8, A10, B3, B6.
5. Delete dead code (D2) and pin the SonarCloud action (D1).
6. Add integration tests covering upload -> parse -> analytics against a real DB.

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
