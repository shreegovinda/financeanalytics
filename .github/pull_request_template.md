## Description

Please include a summary of the changes and why they're being made.

## Related Issue

Closes # (if applicable)

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Documentation update
- [ ] Performance optimization
- [ ] Refactoring

## Changes Made

List the specific changes:
- Change 1
- Change 2
- Change 3

## Testing

Describe the tests you ran and how to reproduce:
- [ ] Tested locally (happy path)
- [ ] Tested error cases
- [ ] UI changes tested in browser
- [ ] API endpoints tested (curl/Postman)
- [ ] No breaking changes to existing functionality

## Documentation

- [ ] README/docs updated if user-facing changes
- [ ] DECISIONS_LOG.md updated if architectural decision made
- [ ] PROJECT_STATUS.md updated with progress
- [ ] SDLC plan updated if scope changed
- [ ] Code comments added for non-obvious logic

## Code Review Checklist

### Security ✅
- [ ] No hardcoded credentials, API keys, or secrets (check .env, env vars, config files)
- [ ] No SQL injection vulnerabilities (parameterized queries, prepared statements used)
- [ ] No XSS vulnerabilities (proper escaping, sanitization, Content Security Policy)
- [ ] No command injection risks (no shell commands with unsanitized input)
- [ ] Environment variables properly used for sensitive data
- [ ] No personal/sensitive user data logged or exposed in error messages
- [ ] No authentication/authorization bypasses (token validation, permission checks)
- [ ] Input validation at all system boundaries (user input, APIs, files)

### Clean Code Principles (Clean Code Book) ✅
**Meaningful Names:**
- [ ] Variable names reveal intent (not `d`, `x`, `temp` - use `elapsedTimeInDays`, `userData`)
- [ ] Function names describe what they do, not how they do it
- [ ] Class/module names are nouns, methods are verbs
- [ ] Avoid disinformation (misleading abbreviations, similar variable names)
- [ ] Use pronounceable, searchable names

**Functions (Small, Single Responsibility):**
- [ ] Functions do one thing well (Single Responsibility Principle)
- [ ] Function names match what they do (if name doesn't fit, function does too much)
- [ ] No side effects (pure functions preferred, document side effects if necessary)
- [ ] Parameters < 3 (reduce cognitive load)
- [ ] No boolean parameters (split into separate functions instead)

**Error Handling:**
- [ ] Use exceptions, not error codes or null returns
- [ ] Exceptions are informative (include context, what failed, why)
- [ ] No empty catch blocks (always handle or log)
- [ ] Specific exceptions caught, not generic `Exception`

**Comments:**
- [ ] No redundant comments ("increment i" comments removed)
- [ ] Comments explain *why*, not *what* (what is obvious from code)
- [ ] Deprecated code removed (not left as comments)
- [ ] No TODO/FIXME left unless tracked in issue

### SOLID Principles ✅
**Single Responsibility Principle (SRP):**
- [ ] Each class/function has one reason to change
- [ ] No mixed concerns (don't mix business logic with validation, formatting, logging)
- [ ] Separation: business logic ≠ UI ≠ database ≠ external APIs

**Open/Closed Principle (OCP):**
- [ ] Open for extension, closed for modification
- [ ] New features added without changing existing code
- [ ] Use inheritance/composition/interfaces for extensibility

**Liskov Substitution Principle (LSP):**
- [ ] Subtypes are substitutable for base types (no surprising behavior)
- [ ] No violations where derived class breaks parent contract

**Interface Segregation Principle (ISP):**
- [ ] No fat interfaces (clients depend only on methods they use)
- [ ] Interfaces focused, not bloated
- [ ] Classes implement only relevant interfaces

**Dependency Inversion Principle (DIP):**
- [ ] Depend on abstractions, not concrete implementations
- [ ] High-level modules don't depend on low-level modules
- [ ] Injected dependencies (constructor injection preferred over globals)

### YAGNI/KISS Principles ✅
- [ ] No speculative features (not coded "just in case")
- [ ] Solution is simplest one that works (avoid over-engineering)
- [ ] No premature abstractions (wait until 3+ similar uses exist)
- [ ] No duplicate code, but also no premature refactoring
- [ ] Design patterns used only when justified by actual problem

### Code Quality & Maintainability ✅
- [ ] Follows project naming conventions (camelCase for JS, snake_case for Python, PascalCase for classes)
- [ ] Code is readable and self-documenting (clear intent without comments)
- [ ] Proper error handling (try/catch at boundaries, validation for user input)
- [ ] No hardcoded values (use constants, config, environment variables)
- [ ] No dead code, commented-out code, or unused imports/variables
- [ ] DRY principle (Don't Repeat Yourself - no copy-paste code)
- [ ] Consistent code style with rest of codebase
- [ ] ESLint and Prettier checks pass (0 warnings policy)
- [ ] No magic numbers (all numbers have meaning: use named constants)
- [ ] Minimal cyclomatic complexity (deeply nested code refactored)

### Testing Coverage ✅
- [ ] Unit tests for business logic (models, services, utilities)
- [ ] Integration tests for API endpoints and database operations
- [ ] Happy path tested (normal flow works)
- [ ] Error cases tested (invalid input, edge cases, failures)
- [ ] Test names describe what is being tested
- [ ] No brittle tests (tests fail on implementation details, not behavior)
- [ ] Test coverage maintained or improved (no decrease in coverage %)
- [ ] Mocks used appropriately (external dependencies mocked, business logic not mocked)

### Logging & Observability ✅
- [ ] Appropriate log levels used (ERROR, WARN, INFO, DEBUG, TRACE)
- [ ] No debug statements left in production code
- [ ] Sensitive data NOT logged (passwords, tokens, API keys, PII)
- [ ] Structured logging used (key-value pairs, not unstructured strings)
- [ ] Error logs include stack trace and context
- [ ] Performance-critical paths have info-level logging
- [ ] Request/response tracing possible (correlation IDs for debugging)

### Performance ✅
- [ ] No N+1 query problems (batch fetch when needed, not loop queries)
- [ ] No unnecessary API calls in loops
- [ ] No blocking operations on main thread (frontend uses async/await)
- [ ] Database queries optimized (proper indices used, execution plans reviewed)
- [ ] No memory leaks (event listeners cleaned up, subscriptions unsubscribed, timers cleared)
- [ ] Bundle size not increased significantly (check before/after with `npm run build`)
- [ ] Frontend render performance acceptable (no jank, Lighthouse score maintained)
- [ ] API response times < 2 seconds for normal operations
- [ ] Lazy loading/code splitting used for large components

### Database Safety ✅
- [ ] Database migrations are backwards compatible
- [ ] Data migrations tested (schema and data consistency verified)
- [ ] Indices added for frequently queried columns
- [ ] Foreign key constraints in place
- [ ] No N+1 queries (eager load relationships when needed)
- [ ] Query performance verified (EXPLAIN PLAN reviewed for large datasets)
- [ ] Transactions used for multi-step operations
- [ ] Database backups tested (schema changes don't break recovery)

### Accessibility (Frontend Changes) ✅
- [ ] Semantic HTML used (proper heading hierarchy, landmarks)
- [ ] ARIA labels added for screen readers (interactive elements, dynamic content)
- [ ] Color not sole means of conveying information
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Focus indicators visible (not hidden with outline: none)
- [ ] Images have alt text (descriptive, not "image" or empty)
- [ ] Forms have proper labels and error messages
- [ ] Contrast ratio meets WCAG AA standards (4.5:1 for text)

### Documentation Quality ✅
- [ ] README updated if user-facing changes or new features
- [ ] API documentation updated (endpoint behavior, parameters, responses)
- [ ] DECISIONS_LOG.md updated if architectural decision made (why this approach?)
- [ ] PROJECT_STATUS.md updated with progress and blockers
- [ ] SDLC plan updated if scope changed
- [ ] Complex logic has brief explanatory comments (why, not what)
- [ ] Database schema changes documented
- [ ] Environment variables documented (what they control, required values)

### Architecture & Design ✅
- [ ] Changes align with SDLC plan and roadmap
- [ ] Follows existing design patterns in codebase (don't introduce new patterns)
- [ ] Proper separation of concerns (business logic ≠ presentation ≠ data access)
- [ ] API contracts unchanged (or backwards compatible if changed)
- [ ] No tight coupling between modules (use dependency injection)
- [ ] Monorepo workspace boundaries respected (backend ≠ frontend dependencies)
- [ ] Configuration properly separated from code

### Backwards Compatibility ✅
- [ ] No breaking changes to API contracts (or version bumped with migration guide)
- [ ] Database migrations are backwards compatible (old code can still run during rollout)
- [ ] No removal of features (only deprecation with warning period)
- [ ] Environment variable names unchanged (add new ones, don't rename)
- [ ] Deprecated APIs still work (mark with deprecation warnings)

### Git Hygiene ✅
- [ ] Commit messages are clear and descriptive (imperative mood: "Add", "Fix", not "Added", "Fixed")
- [ ] Commit messages include why, not just what (context for future developers)
- [ ] Commits are focused (one logical change per commit, not multiple concerns)
- [ ] No merge conflicts left unresolved
- [ ] No accidental files included (.env, node_modules, .DS_Store, secrets)
- [ ] Branch naming follows convention (feature/phase-X-name, fix/issue-name, etc.)
- [ ] Branch has meaningful commits, not "WIP" or "temp" commits

## Screenshots (if applicable)

Add screenshots for UI changes.

## Additional Notes

Any additional context or information reviewers should know.
