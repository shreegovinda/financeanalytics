# Code Review Checklist

**Policy:** This checklist MUST be completed before every commit.  
**Process:** Review each item below, note any findings, and only commit if all items pass.

---

## Pre-Commit Review Template

```
Commit Message: [fill in]
Files Changed: [list]

### Security Review ✅
- [ ] No hardcoded credentials, API keys, or secrets
- [ ] No SQL injection vulnerabilities (parameterized queries used)
- [ ] No XSS vulnerabilities (proper escaping/sanitization)
- [ ] No command injection risks
- [ ] Environment variables properly used for sensitive data
- [ ] No personal/sensitive user data logged

### Code Quality ✅
- [ ] Follows project naming conventions (camelCase for JS, snake_case for Python)
- [ ] Code is readable and self-documenting
- [ ] No unnecessary comments (only "why", not "what")
- [ ] Proper error handling (try/catch, validation at boundaries)
- [ ] No hardcoded values (use constants/env vars)
- [ ] No dead code or commented-out code
- [ ] Consistent code style with rest of codebase

### Performance ✅
- [ ] No obvious N+1 query problems
- [ ] No unnecessary API calls in loops
- [ ] No blocking operations on main thread (frontend)
- [ ] Database queries are optimized (using indices)
- [ ] No memory leaks (event listeners cleaned up, etc.)

### Architecture & Design ✅
- [ ] Changes align with SDLC plan
- [ ] Follows existing design patterns in codebase
- [ ] No unnecessary abstractions or premature optimization
- [ ] Proper separation of concerns (backend/frontend)
- [ ] API contracts unchanged (or documented if changed)
- [ ] Database schema changes documented

### Testing ✅
- [ ] Code tested locally (happy path at minimum)
- [ ] Error cases considered and handled
- [ ] UI changes tested in browser (if applicable)
- [ ] API endpoints tested (via curl or Postman if applicable)
- [ ] No breaking changes to existing functionality

### Documentation ✅
- [ ] Code comments added for non-obvious logic
- [ ] README/docs updated if user-facing changes
- [ ] DECISIONS_LOG.md updated if architectural decision made
- [ ] PROJECT_STATUS.md updated with progress
- [ ] SDLC plan updated if scope changed

### Backwards Compatibility ✅
- [ ] No breaking changes to API contracts
- [ ] Database migrations are backwards compatible
- [ ] No removal of existing features (only deprecation if needed)
- [ ] Environment variables remain the same

### Git Hygiene ✅
- [ ] Commit message is clear and descriptive
- [ ] Commit is focused (one logical change per commit)
- [ ] No merge conflicts left unresolved
- [ ] No accidental files included (.env, node_modules, etc.)
```

---

## Security Review Detailed Checklist

### Database Security
- [ ] SQL queries use parameterized statements (no string concatenation)
- [ ] User input validated before database operations
- [ ] Database credentials never logged
- [ ] Proper authentication/authorization checks in place

### API Security
- [ ] All routes protected by authentication (if required)
- [ ] No sensitive data in URL parameters
- [ ] CORS properly configured
- [ ] Rate limiting considered (if needed)

### Frontend Security
- [ ] No credentials stored in localStorage (use httpOnly cookies if possible)
- [ ] User input sanitized before rendering
- [ ] No eval() or innerHTML with user data
- [ ] Proper error messages (don't leak system info)

### Third-Party Integration
- [ ] API keys/tokens stored in environment variables
- [ ] Third-party libraries are from trusted sources
- [ ] Dependencies updated to latest secure versions (if safe)

---

## Code Quality Examples

### ❌ Before (Issues)
```javascript
// Issue 1: Magic number
const users = await db.query(`SELECT * FROM users WHERE age > ${minAge}`);

// Issue 2: No error handling
router.get('/api/data', (req, res) => {
  const result = db.query(req.body.query);
  res.json(result);
});

// Issue 3: Commented code
// const oldFunction = () => { ... }
```

### ✅ After (Fixed)
```javascript
// Constants defined
const MIN_USER_AGE = 18;
const users = await db.query(
  'SELECT * FROM users WHERE age > ?',
  [MIN_USER_AGE]
);

// Proper error handling
router.get('/api/data', (req, res) => {
  try {
    if (!req.body.query) {
      return res.status(400).json({ error: 'Query required' });
    }
    const result = db.query(req.body.query);
    res.json(result);
  } catch (err) {
    console.error('DB Error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Removed dead code completely
```

---

## Phase-Specific Checks

### Phase 3.1 (Auth)
- [ ] Passwords hashed with bcrypt/strong algorithm
- [ ] JWT tokens have expiration
- [ ] Refresh token strategy documented (if implemented)
- [ ] CORS allows frontend origin only
- [ ] Login state persisted correctly

### Phase 3.2 (File Upload)
- [ ] File size limits enforced
- [ ] File type validation (not just extension)
- [ ] Uploaded files scanned for malicious content
- [ ] User isolation (users can't access other users' files)
- [ ] Parsing errors handled gracefully

### Phase 3.3 (AI Integration)
- [ ] API rate limiting implemented
- [ ] Batch processing working correctly
- [ ] Error retries have exponential backoff
- [ ] Cost monitoring in place (Claude API)

### Phase 3.4 (Analytics)
- [ ] Charts render correctly with empty data
- [ ] Large datasets handled efficiently
- [ ] Date range filtering works
- [ ] Responsive on mobile

---

## Review Sign-Off Format

Include this at the end of commit message:

```
## Code Review
- [x] Security: ✅ No credentials, no injection vulnerabilities
- [x] Quality: ✅ Follows naming conventions, proper error handling
- [x] Performance: ✅ No N+1 queries, optimized
- [x] Architecture: ✅ Aligns with Phase X, follows patterns
- [x] Testing: ✅ Tested locally, happy path + error cases
- [x] Documentation: ✅ DECISIONS_LOG updated, PROJECT_STATUS updated
- [x] Compatibility: ✅ No breaking changes

Ready to commit.
```

---

## When to Flag and NOT Commit

❌ **Do NOT commit if:**
- Security vulnerability found (fix first)
- Code doesn't match existing patterns (discuss first)
- Functionality untested (test first)
- Commit message unclear or misleading
- Breaking changes not documented
- Phase divergence not documented in DECISIONS_LOG

✅ **Flag for discussion before committing:**
- Major architectural changes
- Significant performance implications
- Changes to API contracts
- Changes to database schema
- Scope creep from original plan
