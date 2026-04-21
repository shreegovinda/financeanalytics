# Git Workflow & Branch Strategy

## Branch Naming Convention

All branches must follow this naming convention:

```
<type>/<phase>-<description>
```

**Types:**
- `feature/` - New functionality (Phase 3.2, 3.3, etc.)
- `fix/` - Bug fixes (e.g., signup bug from Phase 3.1)
- `refactor/` - Code refactoring without behavior changes
- `docs/` - Documentation updates only
- `chore/` - Build, CI, dependencies, tooling
- `test/` - Adding or updating tests

**Examples:**
- `feature/phase-3.2-icici-parser` - ICICI PDF parser for file upload phase
- `fix/phase-3.1-signup-redirect` - Signup form redirect bug
- `chore/setup-sonarcloud` - SonarCloud integration
- `docs/update-api-endpoints` - API documentation
- `feature/phase-3.3-claude-batch-api` - Claude API batch processing

---

## Workflow: Feature Development

### 1. Create Feature Branch

```bash
# From main (main should always be stable)
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/phase-3.2-icici-parser
```

### 2. Develop with Commits

Make focused commits with clear messages:

```bash
git add backend/services/parsers/icici.js
git commit -m "Add ICICI PDF parser

Extracts date, amount, and description from ICICI statement PDFs.
Handles multi-page statements and edge cases.

Relates to: SDLC Phase 3.2 - File Upload & Parsing"
```

### 3. Pre-Commit Code Quality Gates

Before every commit, the following runs automatically:

```
┌─────────────────────────────────┐
│ Pre-commit Hook (husky)          │
├─────────────────────────────────┤
│ 1. ESLint (--fix auto-correct)   │
│ 2. Prettier (--write auto-format)│
│ 3. MAX 0 WARNINGS POLICY         │
│ 4. If all pass → commit allowed  │
│ 5. If fails → commit blocked     │
└─────────────────────────────────┘
```

**Run locally before pushing:**

```bash
# Lint frontend and backend
npm run lint

# Auto-fix issues
npm run lint:fix

# Format code
npm run format

# Check if everything passes
npm run format:check
```

If pre-commit hook blocks your commit:
1. Read the error message
2. Run `npm run lint:fix && npm run format`
3. Review changes with `git diff`
4. Stage fixed files with `git add`
5. Commit again

### 4. Create Pull Request

Push your branch and create PR:

```bash
git push origin feature/phase-3.2-icici-parser
# (or) git push --set-upstream origin feature/phase-3.2-icici-parser
```

The PR template (`/.github/pull_request_template.md`) will auto-populate with:
- Description section
- Related issue link
- Type of change checkboxes
- **Full CODE_REVIEW_CHECKLIST**
- Screenshots section

Fill out the PR description completely.

### 5. Automated Checks Run

When PR is created, GitHub Actions runs:

```
┌──────────────────────────────────┐
│ GitHub Actions (lint.yml)        │
├──────────────────────────────────┤
│ 1. Backend ESLint (--max 0)       │
│ 2. Frontend ESLint (--max 0)      │
│ 3. Backend Prettier check         │
│ 4. Frontend Prettier check        │
│ 5. All must pass for merge        │
└──────────────────────────────────┘
```

**Status badges** appear on your PR:
- ✅ All checks passed → ready to review
- ❌ Checks failed → fix locally and push again

### 6. Code Review & Checklist

**You (author) fill out the checklist before requesting review:**
- [ ] Security: No credentials, no injection vulnerabilities
- [ ] Code Quality: Naming conventions, proper error handling
- [ ] Performance: No N+1 queries, optimized
- [ ] Architecture: Aligns with SDLC plan
- [ ] Testing: Code tested locally
- [ ] Documentation: DECISIONS_LOG, PROJECT_STATUS updated
- [ ] Compatibility: No breaking changes

**Reviewer (user) validates:**
- Checklist is complete and accurate
- Code follows the standards outlined
- Changes align with SDLC plan
- No security or performance red flags

### 7. Approval & Merge

- User approves PR → indicates review complete
- Green checkmarks mean safe to merge
- You (or user) merges into `main`

---

## Important Rules

### ❌ DO NOT

- Commit directly to `main` (all changes require PR)
- Push with ESLint/Prettier failures
- Use `--no-verify` to skip pre-commit hooks
- Merge PRs with failing automated checks
- Leave CODE_REVIEW_CHECKLIST unchecked

### ✅ DO

- Use feature branches for all work
- Keep commits focused (one logical change per commit)
- Write clear commit messages with "why" context
- Run `npm run lint:fix` before pushing
- Fill out PR template completely
- Update DECISIONS_LOG & PROJECT_STATUS before PR
- Wait for user approval before merging

---

## GitHub Actions: Continuous Linting

File: `.github/workflows/lint.yml`

Runs on every push to `main` and every PR:
1. Check out code
2. Install dependencies
3. Run ESLint on both backend and frontend
4. Run Prettier format check on both
5. **Fail fast** if any check fails (prevents merge to main)

---

## Undoing Mistakes

### Pushed to wrong branch?

```bash
# Revert the push (be careful!)
git reset --soft HEAD~1  # Keep changes locally
git checkout correct-branch
git add .
git commit -m "Message"
```

### Broke something in a commit?

```bash
# Fix the files locally
# Then amend the commit (only if not pushed to PR yet)
git add .
git commit --amend --no-edit
```

### Need to revert a merged PR?

```bash
git revert <commit-hash>
git push origin main
```

---

## Monorepo Structure

The project uses workspaces (backend + frontend):

```
/financeanalytics
├── backend/          # Node.js + Express
├── frontend/         # Next.js + React
├── package.json      # Root (workspaces config)
├── .eslintrc.json    # (Root level if shared)
├── .husky/           # Pre-commit hooks
├── .github/
│   └── workflows/
│       └── lint.yml  # GitHub Actions
└── .gitignore
```

Running scripts from root:
```bash
npm run lint                           # Lint both
npm run lint --workspace=backend       # Lint only backend
npm run lint --workspace=frontend      # Lint only frontend
```

---

## Summary

1. **Create branch** with proper naming: `feature/phase-X-description`
2. **Code locally** with automatic ESLint/Prettier hooks
3. **Push to branch** (not main)
4. **Create PR** with complete checklist
5. **Automated checks** run on GitHub
6. **User reviews & approves**
7. **Merge** to main (main is always stable)
8. **Repeat** for next feature

All work goes through PRs. Zero direct commits to main.
