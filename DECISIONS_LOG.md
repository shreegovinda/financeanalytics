# Design & Technical Decisions Log

**Purpose:** Track all major architectural and technical decisions made during development to maintain consistency and provide context for future changes.

---

## Decision: PostgreSQL Over MongoDB

**Date:** 2026-04-19  
**Status:** ✅ Implemented  
**Decision:** Use PostgreSQL for database

**Rationale:**
- Financial data requires ACID guarantees (transactions, consistency)
- Relational schema better suited for complex analytics queries (income/expense grouping, trends)
- Strong data integrity for audit trail (statements, categorizations)
- Better support for complex joins (users → statements → transactions → categories)

**Trade-off:** Less flexible schema, but better data safety for financial records

---

## Decision: Next.js 14 for Frontend

**Date:** 2026-04-19  
**Status:** ✅ Implemented  
**Decision:** Use Next.js 14 with React + TypeScript

**Rationale:**
- Server-side rendering (SSR) for better initial load performance
- Built-in API routes (can be used for middleware)
- TypeScript for type safety with financial data
- Fast development iteration
- Easy deployment to Vercel

**Trade-off:** Slightly more opinionated than pure React, but faster TTM

---

## Decision: Node.js + Express for Backend

**Date:** 2026-04-19  
**Status:** ✅ Implemented  
**Decision:** Use Node.js + Express (not Django, Rails, etc.)

**Rationale:**
- Lightweight and fast for file parsing + API calls
- JavaScript ecosystem (pdfplumber alternative, xlsx parsing)
- Easy integration with Claude API
- Matches frontend language (JavaScript/TypeScript)

**Trade-off:** Less mature ORM ecosystem compared to Django/Rails, but simpler for this use case

---

## Decision: JWT Authentication

**Date:** 2026-04-19  
**Status:** ✅ Implemented  
**Decision:** Use JWT tokens for stateless authentication

**Rationale:**
- Stateless (easier to scale horizontally)
- Standard industry practice
- Works well with SPA (Single Page App) frontend
- Can add refresh tokens later for security

**Trade-off:** Tokens stored in localStorage (XSS risk if not careful), but acceptable for MVP

---

## Decision: Zustand for Client State

**Date:** 2026-04-19  
**Status:** ✅ Scaffolded (not fully implemented)  
**Decision:** Use Zustand instead of Context API or Redux

**Rationale:**
- Lightweight (smaller bundle than Redux)
- Simple API (easier to learn than Redux)
- Built-in persistence support (useful for auth tokens later)
- Scales well for this app's complexity

**Trade-off:** Less mature than Redux, but sufficient for MVP

---

## Decision: Recharts for Data Visualization

**Date:** 2026-04-19  
**Status:** ✅ Decided (not implemented)  
**Decision:** Use Recharts for pie/bar charts

**Rationale:**
- React-native (components, not canvas)
- Good animation support
- Responsive by default
- Large community

**Trade-off:** Smaller ecosystem than D3.js, but much easier to use

---

## Decision: Claude 3.5 Sonnet for Transaction Categorization

**Date:** 2026-04-19  
**Status:** ✅ Decided (not implemented)  
**Decision:** Use Claude 3.5 Sonnet API for AI categorization

**Rationale:**
- Best-in-class reasoning for categorization
- Structured output support (JSON)
- Fast response times
- Good pricing for batch processing
- Can handle complex transaction descriptions

**Trade-off:** Cloud API dependency (requires internet), but better accuracy than local models

---

## Decision: Batch Processing for Claude API

**Date:** 2026-04-19  
**Status:** ✅ Designed (not implemented)  
**Decision:** Send transactions in batches of 50 to Claude API

**Rationale:**
- Reduces API calls (cost optimization)
- Faster overall processing for large imports
- Still maintains reasonable latency

**Trade-off:** Memory tradeoff for speed, but acceptable for typical statement size

---

## Decision: No Deletion Policy for Financial Data

**Date:** 2026-04-19  
**Status:** ✅ Designed (not implemented in UI)  
**Decision:** Keep all financial data (statements, transactions) - no deletion

**Rationale:**
- Audit trail requirement
- Users should not accidentally delete financial history
- Better for analytics (historical trends)

**Trade-off:** Database grows indefinitely, but financial data is usually small (10-20 years ≈ 50K transactions)

---

## Decision: Support Indian Banks First (ICICI, HDFC, Axis)

**Date:** 2026-04-19  
**Status:** ✅ Designed (not implemented)  
**Decision:** MVP supports only Indian bank statements (ICICI, HDFC, Axis)

**Rationale:**
- Target user base is individuals in India
- Bank statement formats are region-specific
- Can expand to other banks/countries later
- More focused scope for MVP

**Trade-off:** Limited initial user base, but clearer requirements

---

## Decision: Manual Category Override

**Date:** 2026-04-19  
**Status:** ✅ Designed (not implemented)  
**Decision:** Allow users to manually change transaction categories

**Rationale:**
- AI categorization won't be 100% accurate
- Users have domain knowledge about their spending
- Improves trust in system
- Better analytics with correct categories

**Trade-off:** More UI complexity, but essential for usability

---

## Decision: Store Uploaded PDFs Locally (Phase 1)

**Date:** 2026-04-19  
**Status:** ✅ Designed (not implemented)  
**Decision:** Store uploaded bank statement PDFs in local filesystem initially

**Rationale:**
- Simpler than AWS S3 for MVP
- Audit trail (users can download original statements)
- No cloud storage costs initially

**Trade-off:** Not scalable (migrate to S3 in production), but good for MVP

---

## Known Issues & Pending Decisions

### Signup Form Bug (2026-04-21)
- **Issue:** Frontend signup form doesn't redirect to dashboard after successful registration
- **Status:** Investigating
- **Impact:** Users must use login page after signup (workaround: create accounts via CLI)
- **Decision Pending:** Fix before Phase 3.2 or proceed with workaround?

---

## Future Decisions (To Be Made)

- [ ] Rate limiting strategy for Claude API calls
- [ ] Error recovery strategy for failed file uploads
- [ ] Password reset flow
- [ ] Email verification requirement
- [ ] Data retention policy (when to archive old data)
- [ ] Mobile app vs mobile-responsive web
- [ ] Real-time vs batch processing for categorization
- [ ] Custom category icon/color system

---

## Decision Review Process

For future decisions:
1. Document the decision here BEFORE implementing
2. Include: Date, Status, Rationale, Trade-offs
3. Link to related SDLC plan sections
4. Update status as implementation progresses
5. Record any lessons learned after implementation
