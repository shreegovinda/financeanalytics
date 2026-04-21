# Documentation System

This document explains how documentation is maintained to stay synchronized with implementation and prevent requirements from drifting.

---

## Documentation Files & Purpose

### 1. **SDLC_PLAN** (`/plans/start-with-sdlc-order-lazy-papert.md`)
- **Purpose:** Master plan for entire project execution
- **Contents:** Phases, requirements, architecture, API endpoints
- **Updated:** When phase status changes or scope shifts
- **Audience:** Everyone (high-level overview)

### 2. **PROJECT_STATUS.md**
- **Purpose:** Real-time tracking of current phase progress
- **Contents:** 
  - Phase completion checkboxes
  - Known blockers and issues
  - Current work status
  - Next immediate steps
- **Updated:** After every significant code change or discovery
- **Audience:** Team, user, stakeholders

### 3. **DECISIONS_LOG.md**
- **Purpose:** Explain WHY architectural/technical choices were made
- **Contents:**
  - Every major decision (PostgreSQL, Next.js, JWT, etc.)
  - Rationale and trade-offs
  - Status of implementation
  - Future decisions to be made
- **Updated:** Before implementing new decisions, after discovering issues
- **Audience:** Future developers, architectural reviews

### 4. **CODE_REVIEW_CHECKLIST.md**
- **Purpose:** Enforce code quality standards before commits
- **Contents:**
  - Security, quality, performance criteria
  - Phase-specific checks
  - Review sign-off format
- **Updated:** When standards change or new risks identified
- **Audience:** Developers (self-review before commit)

### 5. **README.md**
- **Purpose:** User-facing documentation
- **Contents:**
  - Features overview
  - Setup instructions
  - Tech stack
  - API endpoints
- **Updated:** When user-facing changes made
- **Audience:** Users, new developers

### 6. **Memory Files** (`/Users/shree.govinda/.claude/projects/-Users-shree-govinda-Downloads/memory/`)
- **Purpose:** Track learnings and context for future sessions
- **Contents:** User preferences, feedback, project context
- **Updated:** When important learnings emerge
- **Audience:** Future Claude sessions

---

## Update Frequency

| Document | When to Update | Who Updates |
|-----------|---|---|
| SDLC_PLAN | Phase completion, scope change | Claude before commit |
| PROJECT_STATUS | Every code change, every finding | Claude in real-time |
| DECISIONS_LOG | New decision made, issue discovered | Claude before code change |
| CODE_REVIEW_CHECKLIST | New risk identified | Claude + User discussion |
| README | User-facing changes | Claude after implementation |
| Memory Files | Important learnings | Claude proactively |

---

## Workflow: Requirements → Code → Documentation

### Example: Adding File Upload Feature (Phase 3.2)

```
1. REQUIREMENTS RECEIVED
   └─ User says: "Add PDF upload for bank statements"

2. DECISION PHASE
   └─ Add to DECISIONS_LOG.md:
      - Decision: Store PDFs locally (not S3) for MVP
      - Rationale: Simpler, faster to ship
      - Trade-off: Not scalable, migrate to S3 later

3. PLANNING PHASE
   └─ Update SDLC_PLAN:
      - Add detailed requirements for Phase 3.2
      - Update API endpoints for /upload
      
4. IMPLEMENTATION PHASE
   └─ Code review checklist before each commit:
      - File size limits enforced? ✅
      - Malicious file scanning? ✅
      - User isolation? ✅

5. TESTING PHASE
   └─ Test locally, document findings in PROJECT_STATUS:
      - "Upload working for PDFs up to 10MB"
      - "Discovered: ICICI format has 3 variants, need parser for each"

6. UPDATE DOCUMENTATION
   └─ After implementation:
      - SDLC_PLAN: Mark Phase 3.2 complete
      - PROJECT_STATUS: Move to Phase 3.3
      - DECISIONS_LOG: Document learnings about PDF parsing
      - README: Add setup instructions for file uploads
```

---

## Handling Requirements Changes

### Scenario: User asks for feature mid-development

```
User Request: "Also support Kotak bank statements"

Process:
1. Record in DECISIONS_LOG:
   - "Kotak bank added to scope (2026-04-21)"
   - "Rationale: User request"
   - "Impact: Phase 3.2 PDF parser needs Kotak variant"

2. Update PROJECT_STATUS:
   - Add blocker: "Need Kotak PDF parser sample"
   - Reassess timeline

3. Update SDLC_PLAN:
   - Phase 3.2 now includes: ICICI, HDFC, Axis, Kotak

4. Discuss with user:
   - "Adding Kotak will extend Phase 3.2 by 2-3 days"
   - "Is this priority? Should we do Kotak or push to Phase 3.2b?"

5. Only after alignment:
   - Start development
   - Apply CODE_REVIEW_CHECKLIST before commits
```

---

## Preventing Documentation Drift

### ❌ Anti-Patterns (What NOT to do)

```
- Don't update README 3 weeks after code is written
- Don't skip DECISIONS_LOG because decision seems "obvious"
- Don't commit without checking CODE_REVIEW_CHECKLIST
- Don't keep requirements in chat messages only
- Don't assume SDLC_PLAN is still accurate without reviewing it
```

### ✅ Best Practices

```
- Update DECISIONS_LOG BEFORE writing code
- Update PROJECT_STATUS DURING development
- Review CODE_REVIEW_CHECKLIST BEFORE every commit
- Link commits to SDLC_PLAN phases
- Archive chat requirements into formal documents
```

---

## Commit Message Format

Every commit should reference the SDLC plan and include review sign-off:

```
Phase 3.2: Add ICICI PDF parser

- Extracts date, amount, description from ICICI statement PDFs
- Handles multi-page statements
- Validates extracted data before storing

Relates to: SDLC Phase 3.2 - File Upload & Parsing
Issue: None

## Code Review
- [x] Security: ✅ No injection vulnerabilities
- [x] Quality: ✅ Follows naming conventions
- [x] Testing: ✅ Tested with 5 ICICI statement samples
- [x] Compatibility: ✅ No breaking changes

Changes:
- backend/services/parsers/icici.js (NEW)
- backend/routes/upload.js (MODIFIED)
```

---

## Documentation Audience

### For Users
- README.md
- API Endpoints section
- Setup instructions

### For Developers
- SDLC_PLAN (what to build)
- DECISIONS_LOG (why it was built that way)
- CODE_REVIEW_CHECKLIST (how to maintain quality)
- Code comments (non-obvious logic only)

### For Project Management
- PROJECT_STATUS.md (real-time progress)
- SDLC_PLAN (timeline, phases)
- DECISIONS_LOG (trade-offs, risks)

### For Claude (Future Sessions)
- Memory files (context, preferences, past issues)
- PROJECT_STATUS (current blocker)
- DECISIONS_LOG (architectural constraints)

---

## How Claude Reviews Before Committing

1. **Security Check**
   - Read the code for secrets, injection risks, XSS
   - Verify credentials stored in env vars only

2. **Quality Check**
   - Naming conventions consistent?
   - Error handling present?
   - Code readable?

3. **Architecture Check**
   - Does it match SDLC plan?
   - Does it follow existing patterns?
   - Is there proper separation of concerns?

4. **Update Documentation**
   - Update PROJECT_STATUS with what was done
   - Update DECISIONS_LOG if new decision made
   - Update SDLC_PLAN phase status

5. **Write Commit Message**
   - Reference SDLC phase
   - Include CODE_REVIEW_CHECKLIST sign-off
   - Clear, descriptive message

6. **Only Then Commit**
   - All checks passed
   - Documentation updated
   - Commit message ready

---

## Questions?

If requirements change, ask:
1. Is this in scope for current phase?
2. Should we document this in DECISIONS_LOG?
3. Does SDLC_PLAN need updating?
4. What's the priority vs timeline?

**Documentation is not busywork—it's the source of truth.**
