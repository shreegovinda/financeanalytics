# Security & Quality Audit

**Audited:** 2026-08-23 against `2ef723d`
**Updated:** 2026-08-23 after merging #26–#31
**Scope:** full git history, CI configuration, backend routes and services

> **A note on detail level.** This repository is public. Findings already fixed
> are described in full. Findings still open are described by *what needs to
> change*, deliberately without reproduction steps. Do not add exploit detail to
> this file while items remain open.

---

## Summary

| Area | Result |
| --- | --- |
| Secrets in git history | ✅ Clean — 397 blobs scanned, no keys, no `.env` ever committed |
| SQL injection | ✅ Clean — every query parameterized |
| Cross-user data access (IDOR) | ✅ Fixed — the one instance was closed by #26/#27 |
| Authentication | ⚠️ OTP and session handling fixed; login throttling still open |
| Dependencies | ❌ 16 advisories (1 critical, 11 high); one has no upstream fix |
| CI fork-PR exfiltration | ✅ Safe — uses `pull_request`, secrets withheld from forks |

**7 of 20 code findings are fixed.** The critical one is among them.

---

## Verified clean

**No secrets in history.** Every blob reachable from any ref (397) was scanned
for Anthropic, Google, Razorpay, SendGrid, GitHub, and AWS key formats plus PEM
private keys. Nothing matched, and no env file was ever committed.

**No SQL injection.** All query call sites use parameterized `$n` placeholders.
`transactions.js` builds its WHERE clause dynamically, but only placeholder
*numbers* are interpolated — values always travel in the params array.

**No CI exfiltration path.** The workflow triggers on `pull_request`, not
`pull_request_target`, so `SONAR_TOKEN` is withheld from fork PRs and
`GITHUB_TOKEN` is read-only for them.

**Tenant isolation.** Every read and write filters by `user_id` from the
verified JWT.

---

## Fixed

### A1. OTP login was brute-forceable — *was Critical* — fixed in #26

`verify-otp` issues a 7-day JWT but had no attempt limit, while the password
*reset* path did. A 6-digit code was therefore guessable within its 5-minute
window, and because issuing a new code did not invalidate outstanding ones, the
effective search space shrank further with each request.

Now: `verify-otp` is rate limited per email and IP; codes are scoped by purpose
(`login` vs `password_reset`) so a reset code cannot buy a session; issuing a new
code invalidates prior unused ones; and verification is atomic via a CTE, closing
a double-redemption race.

### A2. OTPs used `Math.random()` — *was High* — fixed in #26

Replaced with `crypto.randomInt(100000, 1000000)`. Guarded by
`test/otp-generation.test.js`, which now fails if generation stops going through
`crypto`.

### A4. Payment records could be altered across users — *was High* — fixed in #26/#27

The failed-verification path updated by `razorpay_order_id` alone, with no owner
check, while the success path directly above it filtered correctly.

Now scoped to `(order, user, status='pending')`, which closes the cross-user
write *and* stops a late failed retry from downgrading a completed payment. #26
additionally verifies record ownership, status, and that both the stored and
Razorpay-reported amounts match the feature price before checking the signature.

### A11. Sessions survived password changes — *was Medium* — fixed in #29

Added `users.token_version`, embedded in the JWT and incremented on both password
reset and change. Tokens predating the change are treated as version 0 and stay
valid until the user's first password change, so the rollout is backwards
compatible. Verified end to end: after a password change the prior token returns
401 and a replacement is issued to the caller.

### B1. Transaction dates drifted a day west of UTC — *was High* — fixed in #31

`transactions.date` is a Postgres `DATE`, and node-pg serialized a JS Date using
the server's *local* calendar components while the AI's `YYYY-MM-DD` was parsed
as UTC. On any server behind UTC every date shifted back one day, which pushed
month-boundary transactions into the wrong `DATE_TRUNC('month', …)` bucket in
`/analytics/bar` and `/trends`.

`toSqlDate()` now formats via `toISOString()`, so the stored day matches the
parsed day in any zone. Covered across five zones from UTC+14 to UTC−10,
including month start, month end, and a leap day.

### B4. AI-supplied array index was unbounded — *was Medium* — fixed in #27

`categorizeBatch` also dropped the batch offset, so **every statement with more
than 50 transactions wrote categories onto the wrong transactions** — a data
corruption bug affecting essentially every real upload. Results are now filtered
for integer, in-range indexes and mapped to global positions.

### B5. Re-uploading a statement duplicated every transaction — *was Medium* — fixed in #30/#31

#31 imports the statement and its transactions in a single transaction behind a
per-user bank+month guard and duplicate detection. #30 adds a per-user advisory
lock inside that transaction, closing the check-then-insert race, and rejects a
concurrent upload with 409.

---

## Open

Ordered by priority. Descriptions state the required change, not the attack.

### Authentication

| # | Finding | Severity | Required change |
| --- | --- | --- | --- |
| A3 | `send-otp` is unauthenticated and unthrottled, and sends for addresses with no account | High | Rate limit per address and per IP; cap daily sends. Cost and sender reputation are yours. |
| A5 | `login` has no attempt throttling | Medium | Add rate-limiting middleware; none exists anywhere in the app today. |
| A6 | `check-email` returns the account holder's **name** to an unauthenticated caller; the reset path distinguishes known from unknown addresses | Medium | Drop `name` from the response, throttle it, and return an identical response for both cases on the reset path. |
| A10 | Registration enforces no password strength; reset and change both require 8 characters | Medium | Apply the same rule at registration, and validate email format. |
| B2 | Emails are matched case-sensitively, so `User@x.com` and `user@x.com` are separate accounts | Medium | Normalize on write and read; add a unique index on `LOWER(email)`, as `categories` already does. |

### Payments

| # | Finding | Severity | Required change |
| --- | --- | --- | --- |
| A7 | Signature compared with `===` | Medium | Use `crypto.timingSafeEqual` after a length check. |
| A8 | The feature-id guard uses truthiness, so inherited `Object` members pass | Medium | `Object.prototype.hasOwnProperty.call(...)`. Covered by a failing-if-regressed test. |

### Uploads and API

| # | Finding | Severity | Required change |
| --- | --- | --- | --- |
| A9 | File type is validated from the filename only | Medium | Verify magic bytes before parsing — this matters more while `xlsx` is unpatched (C1). |
| A12 | No global Express error handler | Low | Add one; multer rejections currently fall through to Express's default, which returns HTML and includes stack traces outside production. |
| B3 | `limit`/`offset` on `GET /transactions` are unvalidated and uncapped | Medium | Mirror `payments.js`, which already does `Math.min(parseInt(...) \|\| 10, 100)`. |
| B6 | `/trends` ignores `ai_suggested_category` while `/pie` honours it, so the two charts disagree on the same rows | Low | Use the same `COALESCE` in both. |
| B7 | The bulk insert uses 6 params per transaction against Postgres's 65,535 cap (~10,900 rows) | Low | Chunk the insert. |
| B8 | The OTP attempt map is unbounded and per-process | Low | Evict expired entries; move to shared storage before running multiple instances. |

### Operational

- `cleanupExpiredOTPs` is exported but never scheduled, so `otp_codes` grows
  without bound.
- `resumeProcessingStatements` runs only at startup. A statement wedged in
  `processing` blocks that user's uploads (409) until the next restart.

---

## Dependencies

`npm audit`: **16 vulnerabilities (1 critical, 11 high, 2 moderate, 2 low)**.

### C1. `xlsx` — high, **no fix available**

Prototype pollution and ReDoS, with no patched version on the registry. It parses
untrusted user uploads, which is the worst place for it. Options: SheetJS's own
distribution, `exceljs`, or parsing out-of-process. Pairs with A9.

### C2. `next-auth` — critical, **and unused**

The only critical advisory. A grep across `frontend/**/*.ts{,x}` finds no usage —
it is a leftover dependency. **Removing it eliminates the critical finding at
zero cost**, and is the highest value-per-effort item here.

### C3. Fixes available

`axios`, `form-data`, `multer`, `nanoid`, `brace-expansion`, `js-yaml`, `qs`,
`uuid` via `npm audit fix`. `next` (→ 16.3.2), `postcss`, `sharp` are non-major.
`nodemailer` (→ 9.0.5) is a major bump needing a compatibility check.

---

## Tooling

### D1. SonarCloud action pinned to a mutable ref

`.github/workflows/lint.yml` uses `SonarSource/sonarcloud-github-action@master` —
whatever that branch contains at run time, executing with `SONAR_TOKEN` in scope.
Pin to a release tag or commit SHA. The action is also deprecated in favour of
`sonarqube-scan-action`.

### D2. Dead code

- `backend/services/parsers/{icici,hdfc,axis}.js` — not imported by any route;
  `generic.js` replaced them.
- `backend/test-parser*.js`, `backend/create-test-*.js` — ad-hoc scripts at the
  backend root, superseded by `backend/test/`.
- `crypto` in `backend/package.json` dependencies is the deprecated npm shim, not
  the Node builtin. Remove it.
- `next-auth` — see C2.

### D3. Duplicate schema file — resolved

`backend/config/schema.sql` was described by the README as canonical but was
**missing the `otp_codes` and `payments` tables entirely**, along with several
indices and every `NOT NULL` constraint. Following the documented setup produced
a database where OTP login and payments failed at runtime.

It survived that way for months precisely because it was duplicated: PRs #26,
#29, and #31 all dutifully added new columns to *both* files without noticing two
whole tables were absent from one of them. Deleted; the README now points at
`backend/db/schema.sql`, which `db/init.js` actually loads.

---

## Recommended order

1. **C2** — remove `next-auth`. One line, clears the only critical advisory.
2. **A3, A5** — the two unthrottled endpoints.
3. **A10, B2** — registration and email normalization; B2 gets harder the more
   accounts exist.
4. **A7, A8, B3, B6** — small, well-understood.
5. **A9 + C1** — plan together.
6. **D2** — delete dead code.
