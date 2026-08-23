# Security & Quality Audit

**Date:** 2026-08-23
**Commit audited:** `2ef723d` (master)
**Scope:** full git history, CI configuration, backend routes and services

This audit was read-only. Nothing here has been fixed yet — see
`PROJECT_STATUS.md` for the tracked list.

---

## Summary

| Area | Result |
| --- | --- |
| Secrets in git history | ✅ Clean — 397 blobs scanned, no keys found, no `.env` ever committed |
| SQL injection | ✅ Clean — every query is parameterized, no string interpolation |
| Cross-user data access (IDOR) | ⚠️ One instance, in the payment failure path |
| Authentication | ❌ OTP login is brute-forceable and uses a predictable generator |
| Dependencies | ❌ 16 advisories (1 critical, 11 high); one has no upstream fix |
| CI fork-PR exfiltration | ✅ Safe — uses `pull_request`, so secrets are withheld from forks |

The single most urgent item is **A1**: the OTP login endpoint can be brute-forced
into a full account takeover.

---

## What was checked and found clean

**No secrets in history.** Every blob reachable from any ref (397 total) was
scanned for Anthropic, Google, Razorpay, SendGrid, GitHub, and AWS key formats
plus PEM private keys. Nothing matched. No `.env`, `.env.local`, or
`.env.production` file was ever committed, and `.gitignore` covers them.

**No SQL injection.** All 59 query call sites across the backend use
parameterized `$1` placeholders. `transactions.js` builds its WHERE clause and
its UPDATE SET list dynamically, but only the *placeholder numbers* are
interpolated — values always go through the params array. This is correct.

**No CI exfiltration path.** `.github/workflows/lint.yml` triggers on
`pull_request`, not `pull_request_target`, so `SONAR_TOKEN` is not exposed to
pull requests from forks, and `GITHUB_TOKEN` is read-only for them.

**Tenant isolation is otherwise solid.** Every read and write in
`transactions.js`, `analytics.js`, `categories.js`, and `upload.js` filters by
`user_id` from the verified JWT. The one exception is A4 below.

---

## A. Security findings

### A1. `verify-otp` is unthrottled — account takeover — **Critical**

`backend/routes/auth.js:229`

`POST /api/auth/verify-otp` accepts an email and a 6-digit code and, on success,
issues a 7-day JWT. There is no limit on attempts.

The password *reset* path was given rate limiting in PR #5
(`checkResetOtpRateLimit`, `auth.js:17`), but that guard was never applied to
`verify-otp`, which is the endpoint that actually hands out a session.

**Attack:** call `POST /api/auth/send-otp` with any victim's email, then
enumerate codes against `verify-otp`. The keyspace is 900,000 and the window is
5 minutes. Worse, `send-otp` can be called repeatedly and every issued code stays
valid until it expires or is used — `verifyOTP` matches on `code` alone
(`otp.js:127`), so N outstanding codes divide the search space by N.

**Fix:** apply the existing `checkResetOtpRateLimit` pattern to `verify-otp`,
keyed on email; invalidate all prior codes when a new one is issued; and lock the
account's OTP flow after a small number of failures.

### A2. OTPs are generated with `Math.random()` — **High**

`backend/services/otp.js:6`

```js
return Math.floor(100000 + Math.random() * 900000).toString();
```

`Math.random()` is a non-cryptographic PRNG (xorshift128+ in V8). Its internal
state is recoverable from a modest number of observed outputs, after which all
future codes are predictable. An attacker can harvest codes by requesting them
for their own account.

**Fix:** `crypto.randomInt(100000, 1000000)`.

Covered by `backend/test/otp-generation.test.js`, which demonstrates that the
output is a pure function of `Math.random()`.

### A3. `send-otp` is unauthenticated and unthrottled — **High**

`backend/routes/auth.js:200`

Accepts any email address and sends mail through SendGrid. It does not require
authentication, does not rate limit, and sends even when no such account exists
(falling back to the name `'User'`).

**Impact:** anyone can use your SendGrid account to bombard an arbitrary address,
at your cost and against your sender reputation.

**Fix:** rate limit per email and per IP, and cap total sends per address per day.

### A4. Payment failure path lets one user tamper with another's record — **High**

`backend/services/payment.js:177`

```sql
UPDATE payments SET status = $1, error_message = $2, updated_at = NOW()
WHERE razorpay_order_id = $3
```

No `user_id` filter. The success path immediately above it (`payment.js:160`)
*does* filter by `user_id` — so this is an inconsistency within the same
function, not a missing convention.

**Attack:** an authenticated user calls `POST /api/payments/verify` with another
user's `orderId` and a deliberately invalid signature. Signature verification
fails, execution reaches the failure handler, and the victim's payment row is
marked `failed` with an attacker-influenced `error_message`.

**Fix:** add `AND user_id = $4`, matching the success path.

### A5. No rate limiting on `login` — **Medium**

`backend/routes/auth.js:96`

Unlimited password attempts. bcrypt at cost 10 provides some drag, but that also
makes this a cheap CPU-exhaustion vector. No rate-limiting middleware
(`express-rate-limit` or equivalent) exists anywhere in the app.

### A6. Account enumeration and name disclosure — **Medium**

`backend/routes/auth.js:76` (`check-email`) returns `{exists: true, user: {name}}`
to an unauthenticated caller. This leaks not only whether an address is
registered but **the account holder's real name** — confirmed live: entering a
registered address renders "Welcome back, Dev Test!" before any credential is
supplied.

`forgot-password/send-otp` (`auth.js:130`) similarly returns 404 "No account
found for this email".

**Fix:** if the pre-flight UX is worth keeping, drop `name` from the response and
rate limit the endpoint. Return an identical response for both cases on the
password-reset path.

### A7. Razorpay signature compared non-timing-safely — **Medium**

`backend/services/payment.js:123`

```js
const isValid = signature === expectedSignature;
```

`===` on strings short-circuits at the first differing byte. Remote timing
attacks over a network are difficult in practice, but this is a payment
authorization check and the fix is one line.

**Fix:** `crypto.timingSafeEqual` on equal-length buffers, after a length check.

### A8. Feature-id guard bypassed by inherited `Object` keys — **Medium**

`backend/services/payment.js:64`

```js
if (!PREMIUM_FEATURES[featureId]) throw new Error('Invalid feature ID');
```

Property access walks the prototype chain. `featureId = "constructor"`,
`"toString"`, `"valueOf"`, or `"hasOwnProperty"` all return truthy values and
pass the guard. Execution then reaches Razorpay with `amount: undefined`.

**Fix:** `Object.prototype.hasOwnProperty.call(PREMIUM_FEATURES, featureId)`.

Covered by `backend/test/payment-signature.test.js`.

### A9. Upload type check trusts the filename — **Medium**

`backend/routes/upload.js:35`

The `fileFilter` tests `path.extname(file.originalname)` against
`/\.(pdf|xlsx|xls)$/i`. Content is never inspected, so any file renamed to
`.pdf` or `.xlsx` is accepted and handed to `pdf-parse` or `xlsx` — the latter
having an unpatched prototype-pollution advisory (see C1).

The generated storage filename is safe: it is built from `Date.now()` plus a
random suffix, so the original name never reaches the filesystem path.

**Fix:** verify magic bytes (`%PDF-` / `PK\x03\x04`) before parsing.

### A10. No password strength requirement at registration — **Medium**

`backend/routes/auth.js:41`

`PUT /api/auth/password` (`auth.js:316`) and `forgot-password/reset`
(`auth.js:165`) both enforce a minimum of 8 characters. `register` enforces
nothing — a single-character password is accepted. Email format is not validated
either.

### A11. JWTs cannot be revoked — **Medium**

`backend/middleware/auth.js:11`

Tokens are stateless with a 7-day expiry and there is no denylist or token
version. Changing or resetting a password does not invalidate existing sessions,
so a user who resets *because* they believe they are compromised does not
actually evict the attacker for up to a week.

**Fix:** add a `token_version` column to `users`, include it in the JWT claims,
and bump it on password change.

### A12. No global error handler — **Low**

`backend/server.js`

No `app.use((err, req, res, next) => ...)` is registered. Errors thrown by
multer (rejected file type, size limit) fall through to Express's default
handler, which includes the stack trace in the response whenever
`NODE_ENV !== 'production'`. Clients also receive HTML rather than the JSON
shape the frontend expects.

---

## B. Correctness findings

### B1. Transaction dates drift one day in timezones behind UTC — **High**

`backend/services/parsers/generic.js:116`

The AI returns `"YYYY-MM-DD"`. `new Date("2026-04-05")` parses as **UTC**
midnight. `transactions.date` is a Postgres `DATE`, and node-pg serializes a JS
Date using its **local** calendar components. When the two disagree, the stored
day is wrong.

Verified empirically:

| Server TZ | Input | Stored |
| --- | --- | --- |
| `Asia/Kolkata` | `2026-04-05` | `2026-04-05` ✅ |
| `UTC` | `2026-04-05` | `2026-04-05` ✅ |
| `America/New_York` | `2026-04-05` | `2026-04-04` ❌ |

This is latent today because development runs in IST, but it triggers on any
deployment west of UTC. The damaging case is the 1st of a month: it becomes the
last day of the previous month, and `DATE_TRUNC('month', date)` in
`/api/analytics/bar` and `/trends` then files it under the wrong month.

**Fix:** pass the `YYYY-MM-DD` string straight to Postgres rather than a JS Date.

Covered by `backend/test/transaction-date-timezone.test.js`, including a `todo`
test that will pass once this is fixed.

### B2. Emails are matched case-sensitively — **Medium**

`backend/routes/auth.js` — every lookup uses `WHERE email = $1`, and the schema
declares `email VARCHAR(255) UNIQUE` with no normalization.

`Shree@example.com` and `shree@example.com` are therefore two distinct accounts.
A user who registers with one capitalization and logs in with another gets
"Invalid credentials". Note that `getResetOtpKey` (`auth.js:14`) *does*
lowercase, so the codebase already disagrees with itself.

**Fix:** normalize to lowercase on write and read; add a unique index on
`LOWER(email)` — the `categories` table already uses exactly this pattern.

### B3. `limit` and `offset` are unvalidated — **Medium**

`backend/routes/transactions.js:11`

```js
const { limit = 100, offset = 0 } = req.query;
```

Passed to Postgres untouched. `?limit=abc` produces a driver error and a 500.
There is no upper bound, so `?limit=99999999` will happily try to serialize the
entire table.

`payments.js:88` already does this correctly:
`Math.min(parseInt(req.query.limit) || 10, 100)`. Apply the same treatment here.

### B4. AI-supplied array index is not bounds-checked — **Medium**

`backend/routes/transactions.js:164` and `backend/routes/upload.js:146`

```js
if (result.transactionIndex < txnIds.length) {
  ... txnIds[result.transactionIndex]
}
```

`transactionIndex` comes from the model's JSON. The check has no lower bound: a
negative value passes, `txnIds[-1]` is `undefined`, and the resulting query
throws. In `upload.js` that exception propagates far enough to mark the entire
statement `failed`, discarding a successful parse because of one bad index.

**Fix:** `Number.isInteger(i) && i >= 0 && i < txnIds.length`.

### B5. Re-uploading a statement silently duplicates every transaction — **Medium**

`backend/routes/upload.js:209`

There is no deduplication on file hash or on (date, amount, description). A user
who uploads the same PDF twice doubles their spending totals with no warning.
For a finance tool this is a data-integrity problem, not a cosmetic one.

### B6. `trends` and `pie` disagree on the same data — **Low**

`backend/routes/analytics.js:54` vs `:11`

`/pie` falls back to `ai_suggested_category` when no category is assigned:

```sql
COALESCE(c.name, NULLIF(t.ai_suggested_category, ''), 'Other')
```

`/trends` does not — it uses `COALESCE(c.name, 'Other')`. Uncategorized
transactions therefore appear under their AI-suggested category in the pie chart
and lumped into "Other" in trends, from the same underlying rows.

### B7. Bulk insert can exceed Postgres's parameter limit — **Low**

`backend/routes/upload.js:114`

A single `INSERT` is built with 6 parameters per transaction. Postgres caps a
statement at 65,535 parameters, so any statement yielding more than ~10,922
transactions fails outright. Unlikely within the 10 MB upload limit, but it fails
loudly and late — after parsing and an AI call have already been paid for.

### B8. `resetOtpAttempts` grows without bound — **Low**

`backend/routes/auth.js:9`

An in-process `Map` whose entries are only removed on *successful* reset. Failed
attempts accumulate for the lifetime of the process. It is also per-process, so
it provides no protection once more than one instance runs.

---

## C. Dependencies

`npm audit`: **16 vulnerabilities (1 critical, 11 high, 2 moderate, 2 low)**.

### C1. `xlsx` — high, **no fix available**

Prototype pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9). The
registry has no patched version. This package parses untrusted user uploads
(`generic.js:43`), which is the worst possible position for it.

**Options:** migrate to the maintained `xlsx` distribution from SheetJS's own CDN,
switch to `exceljs`, or parse spreadsheets out-of-process in a sandbox.

### C2. `next-auth` — critical, **and entirely unused**

The only critical advisory in the tree. A grep for `next-auth` across
`frontend/**/*.ts{,x}` returns **no usages** — it is a leftover dependency.

**Removing it eliminates the critical finding at zero cost.** This is the single
highest value-per-effort item in the audit.

### C3. Fixes available via `npm audit fix`

`axios`, `form-data`, `multer`, `nanoid`, `brace-expansion`, `js-yaml`, `qs`,
`uuid`. `next` (→ 16.3.2), `postcss`, and `sharp` are non-major upgrades.
`nodemailer` (→ 9.0.5) is a major bump and needs a compatibility check.

---

## D. Tooling

### D1. SonarCloud action pinned to a mutable ref

`.github/workflows/lint.yml:42`

```yaml
uses: SonarSource/sonarcloud-github-action@master
```

`@master` means whatever that branch happens to contain at run time, executing
with `SONAR_TOKEN` in scope. Pin to a release tag or a commit SHA. (This action
is also deprecated in favour of `sonarqube-scan-action`.)

### D2. Dead code

- `backend/services/parsers/{icici,hdfc,axis}.js` — not imported by any route;
  `generic.js` replaced them.
- `backend/test-parser{s,-exact,-logic}.js`, `backend/create-test-{pdfs,excel}.js`
  — ad-hoc scripts at the backend root, superseded by `backend/test/`.
- `crypto` is listed in `backend/package.json` dependencies. That is the
  deprecated npm shim, not the Node builtin; remove it.
- `next-auth` — see C2.

### D3. Two schema files had diverged

`backend/config/schema.sql` was described by the README as "the canonical schema
file", but it was **missing the `otp_codes` and `payments` tables entirely**,
along with several indices and every `NOT NULL` constraint. Anyone following the
documented setup produced a database where OTP login and payments failed at
runtime. Only `backend/db/schema.sql` (loaded by `db/init.js`) was complete.

Fixed on branch `docs/sync-status-and-setup`: the stale file is deleted and the
README points at `db/schema.sql`.

---

## Recommended order

1. **C2** — remove `next-auth`. One line, kills the critical advisory.
2. **A1, A2, A3** — the OTP takeover chain. These compound; fix together.
3. **A4** — one `AND user_id = $4`.
4. **B1** — timezone bug, before any non-IST deployment.
5. **A5, A10, A11** — auth hardening.
6. **A7, A8, A9, B3, B4** — small, well-understood fixes.
7. **C1** — plan the `xlsx` migration; it needs real design work.
8. **D2** — delete dead code.
