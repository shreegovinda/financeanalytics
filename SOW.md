# Statement of Work (SOW)
## Personal Finance Analytics Platform

**Document Version:** 1.0  
**Date:** 2026-04-22  
**Project Status:** Phase 3.2 Complete (File Upload & Parsing)  
**Target Completion:** 2026-05-31

---

## 1. EXECUTIVE SUMMARY

### Project Overview
A personal finance analytics platform that enables users to upload bank statements (PDF/Excel) from Indian banks (ICICI, HDFC, Axis), automatically extract and categorize transactions using Claude AI, and visualize spending patterns through interactive dashboards.

### Key Objectives
- **Objective 1:** Enable users to upload bank statements with automatic format detection (ICICI/HDFC/Axis)
- **Objective 2:** Extract and store transaction data with high accuracy (>95%)
- **Objective 3:** Auto-categorize transactions using Claude AI with manual override capability
- **Objective 4:** Provide actionable spending insights through analytics dashboards
- **Objective 5:** Support custom categories and transaction editing by users

---

## 2. SCOPE OF WORK

### In-Scope Features
| Phase | Feature | Scope |
|-------|---------|-------|
| 3.1 | User Authentication (Email/Password/OAuth) | Complete ✅ |
| 3.1 | JWT-based Authorization | Complete ✅ |
| 3.2 | File Upload (PDF/Excel) | Complete ✅ |
| 3.2 | ICICI Bank PDF Parser | Complete ✅ |
| 3.2 | HDFC Bank PDF Parser | Complete ✅ |
| 3.2 | Axis Bank Excel Parser | Complete ✅ |
| 3.2 | Transaction Storage & Indexing | Complete ✅ |
| 3.3 | Claude AI Auto-Categorization | In Progress |
| 3.3 | Batch Transaction Processing | In Progress |
| 3.3 | API Error Handling & Retries | In Progress |
| 3.4 | Analytics Dashboard (Pie Chart) | Pending |
| 3.4 | Analytics Dashboard (Bar Chart) | Pending |
| 3.4 | Transaction Table with Filters | Pending |
| 3.5 | Custom Category Management | Pending |
| 3.5 | Category CRUD Operations | Pending |
| 3.6 | Mobile Responsiveness | Pending |
| 3.6 | Performance Optimization | Pending |
| 3.6 | End-to-End Testing | Pending |

### Out-of-Scope (Future Phases)
- Multi-currency support
- Recurring transaction detection
- Budget forecasting
- Bill payment integration
- Mobile native apps
- Multi-user household accounts
- AWS S3 integration (using local storage for MVP)

---

## 3. DELIVERABLES

### Phase 3.1: Setup & Auth (COMPLETE)
- ✅ Next.js project structure with TypeScript
- ✅ PostgreSQL database schema
- ✅ Email/password authentication endpoints
- ✅ Google OAuth scaffolding
- ✅ JWT token generation and middleware
- ✅ User dashboard page
- ✅ Login/Signup/Logout flows

### Phase 3.2: File Upload & Parsing (COMPLETE)
- ✅ Multer file upload middleware
- ✅ Bank detection logic (ICICI/HDFC/Axis)
- ✅ ICICI PDF parser (pdfplumber)
- ✅ HDFC PDF parser (pdfplumber)
- ✅ Axis Excel parser (xlsx library)
- ✅ Transaction extraction & validation
- ✅ Database schema (statements, transactions, categories tables)
- ✅ REST API endpoints for upload/retrieval
- ✅ Frontend upload form with drag-drop UI
- ✅ Statements listing and detail pages
- ✅ Transactions page with filtering

### Phase 3.3: Claude AI Integration (IN PROGRESS)
- Anthropic SDK integration
- Batch categorization endpoint
- AI suggestion storage (ai_suggested_category column)
- Error handling with exponential backoff retries
- Rate limit management
- Cost tracking/monitoring

### Phase 3.4: Dashboard & Analytics (PENDING)
- Recharts integration
- Pie chart (spending by category)
- Bar chart (monthly income/expenses)
- Summary statistics widget
- Transaction filtering UI
- Category-wise breakdown

### Phase 3.5: Custom Categories (PENDING)
- Category CRUD UI
- Create custom categories
- Delete/edit categories
- Bulk reassign transactions
- Default vs custom category indicators

### Phase 3.6: Polish & Testing (PENDING)
- Error boundary components
- Loading states
- Empty state UI
- Error recovery flows
- Mobile responsive design
- Lazy loading for charts
- Unit tests (Jest)
- Integration tests
- E2E tests (Cypress)

---

## 4. TIMELINE & MILESTONES

```
Phase 3.1 (Auth):           Apr 14 - Apr 17  [COMPLETE]
Phase 3.2 (File Upload):    Apr 18 - Apr 22  [COMPLETE]
Phase 3.3 (AI Integration): Apr 23 - Apr 27  [IN PROGRESS]
Phase 3.4 (Dashboard):      Apr 28 - May 04  [PENDING]
Phase 3.5 (Custom Cat):     May 05 - May 11  [PENDING]
Phase 3.6 (Polish & Test):  May 12 - May 31  [PENDING]

Total Duration: 6 weeks
```

### Key Milestones
- **Apr 22:** Phase 3.2 Complete (File Upload & Parsing) ✅
- **Apr 27:** Claude AI Categorization Live (Phase 3.3)
- **May 04:** Analytics Dashboard Live (Phase 3.4)
- **May 11:** Custom Categories Live (Phase 3.5)
- **May 31:** MVP Ready for User Testing (Phase 3.6)

---

## 5. RESOURCE REQUIREMENTS

### Team Composition

| Role | FTE | Monthly Cost | Duration | Total |
|------|-----|--------------|----------|-------|
| **Full-Stack Engineer** | 1.0 | $6,000 | 6 weeks | $9,000 |
| **QA Engineer** | 0.5 | $3,000 | 2 weeks | $1,500 |
| **DevOps Engineer** | 0.3 | $4,000 | 2 weeks | $600 |
| **Product Manager** | 0.25 | $4,000 | 6 weeks | $2,400 |

**Total Labor Cost:** $13,500

### Skills Required
- **Full-Stack:** JavaScript/TypeScript, React, Node.js, PostgreSQL
- **Frontend:** Next.js, Tailwind CSS, Recharts, Axios
- **Backend:** Express.js, JWT, PDF/Excel parsing, API design
- **Database:** PostgreSQL schema design, query optimization
- **DevOps:** Docker, CI/CD (GitHub Actions), Linux
- **AI/ML:** Claude API integration, prompt engineering

---

## 6. TECHNOLOGY STACK & LICENSING

### Frontend Stack

| Technology | License | Cost | Notes |
|------------|---------|------|-------|
| Next.js 14 | MIT | Free | Open-source React framework |
| React 18 | MIT | Free | Open-source UI library |
| TypeScript | Apache 2.0 | Free | Open-source type system |
| Tailwind CSS | MIT | Free | Open-source CSS framework |
| Recharts | MIT | Free | Open-source charting library |
| Axios | MIT | Free | Open-source HTTP client |
| NextAuth.js | ISC | Free | Open-source auth library |

### Backend Stack

| Technology | License | Cost | Notes |
|------------|---------|------|-------|
| Node.js | MIT | Free | Open-source runtime |
| Express.js | MIT | Free | Open-source web framework |
| PostgreSQL | PostgreSQL | Free | Open-source database |
| JWT (jsonwebtoken) | MIT | Free | Open-source token library |
| Multer | MIT | Free | File upload middleware |
| pdfplumber | MIT | Free | PDF parsing |
| xlsx | Apache 2.0 | Free | Excel parsing |
| Anthropic SDK | MIT | Free | Claude API client |

### DevOps Stack

| Technology | License | Cost | Notes |
|------------|---------|------|-------|
| GitHub | Proprietary | Free (Public) | Version control |
| GitHub Actions | Proprietary | Free (Public) | CI/CD pipeline |
| SonarCloud | Proprietary | Free (Public) | Code quality |
| ESLint | MIT | Free | Code linting |
| Prettier | MIT | Free | Code formatting |
| Husky | MIT | Free | Git hooks |

### Development Tools

| Tool | License | Cost | Notes |
|------|---------|------|-------|
| VS Code | MIT | Free | Code editor |
| Git | GPL | Free | Version control |
| Docker | Proprietary | Free (Community) | Containerization |
| Postman | Proprietary | Free (Basic) | API testing |

**Total Third-Party Licensing Cost:** $0 (All open-source)

---

## 7. INFRASTRUCTURE REQUIREMENTS & COSTS

### Development Environment

| Component | Specification | Cost |
|-----------|---------------|------|
| **Local Machine** | Developer laptop (existing) | $0 |
| **Database (Dev)** | PostgreSQL 15 (local) | $0 |
| **Storage (Dev)** | Local file system | $0 |

**Dev Environment Cost:** $0/month

### Staging Environment (Post-MVP)

| Component | Specification | Cost | Notes |
|-----------|---------------|------|-------|
| **Compute** | 2x 1GB RAM instances (Render/Railway) | $20/month | Single backend + frontend |
| **Database** | PostgreSQL Managed (Supabase/Neon) | $20/month | 1GB storage, backups |
| **File Storage** | S3 Compatible (MinIO/Wasabi) | $0.006/GB | ~$5/month for 1000 statements |
| **API Hosting** | Backend (Render/Railway) | $20/month | Auto-scaling |
| **CDN** | Cloudflare (Free tier) | $0 | Caching + DDoS protection |
| **Monitoring** | Datadog (Free tier) | $0 | Logs, metrics |
| **SSL Certificates** | Let's Encrypt | $0 | Auto-renewal |

**Staging Cost:** ~$45/month

### Production Environment (Post-Launch)

| Component | Specification | Cost | Notes |
|-----------|---------------|------|-------|
| **Compute** | 4x 2GB RAM instances (AWS/GCP) | $200/month | Load-balanced, HA |
| **Database** | RDS PostgreSQL (Multi-AZ) | $100/month | 100GB storage, auto-backup |
| **File Storage** | AWS S3 | $50/month | 10GB storage, transfer costs |
| **API Gateway** | AWS API Gateway | $35/month | 1M requests/month |
| **CDN** | Cloudflare Pro | $20/month | Performance + security |
| **Monitoring** | Datadog APM | $50/month | Full observability |
| **Backup** | AWS Backup | $20/month | Daily snapshots |
| **Email Service** | SendGrid | $30/month | Password reset, notifications |
| **SSL Certificates** | AWS Certificate Manager | $0 | Free with AWS |

**Production Cost:** ~$500/month (for 100k users)

### AWS Cost Estimation (First Year Post-Launch)

| Component | Monthly | Annual |
|-----------|---------|--------|
| EC2 (Compute) | $200 | $2,400 |
| RDS (Database) | $100 | $1,200 |
| S3 (Storage) | $50 | $600 |
| CloudFront (CDN) | $35 | $420 |
| Route53 (DNS) | $1 | $12 |
| CloudWatch (Monitoring) | $25 | $300 |
| **TOTAL** | **$411** | **$4,932** |

---

## 8. CLAUDE API COSTS

### Batch Categorization Pricing

**Claude 3.5 Sonnet:**
- Input: $3 per 1M tokens
- Output: $15 per 1M tokens

**Assumptions per User:**
- Average statements per user: 12/year (monthly uploads)
- Average transactions per statement: 50 transactions
- Total transactions/user/year: 600 transactions
- Tokens per categorization request: ~1000 tokens (50 transactions)
- Requests per user/year: 12

**Calculation:**
- Input tokens: 12 requests × 1000 tokens = 12,000 tokens/user/year
- Output tokens: 12 requests × 500 tokens = 6,000 tokens/user/year
- Cost per user: (12,000 × $3 + 6,000 × $15) / 1,000,000 = $0.126/user/year

**For 1000 Users:**
- Annual cost: 1000 × $0.126 = $126/year
- Monthly average: $10.50/month

**For 100k Users:**
- Annual cost: 100,000 × $0.126 = $12,600/year
- Monthly average: $1,050/month

---

## 9. COST SUMMARY

### One-Time Development Costs

| Category | Cost |
|----------|------|
| **Labor (6 weeks)** | $13,500 |
| **Initial Licenses** | $0 |
| **Setup & Configuration** | $500 |
| **Testing Environments** | $500 |
| **TOTAL ONE-TIME** | **$14,500** |

### Recurring Costs (Monthly)

| Category | Dev | Staging | Production (100k users) |
|----------|-----|---------|-------------------------|
| **Infrastructure** | $0 | $45 | $411 |
| **API Costs** | $0 | $10 | $1,050 |
| **Monitoring** | $0 | $0 | $50 |
| **Support** | $0 | $0 | $500 |
| **TOTAL/MONTH** | **$0** | **$55** | **$2,011** |

### Year 1 Cost Projection

| Phase | Timeframe | Cumulative Cost |
|-------|-----------|-----------------|
| Development | Apr 22 - May 31 | $14,500 |
| Staging + Testing | Jun 01 - Jun 30 | $14,500 + $55 = $14,555 |
| Production Launch | Jul 01+ | $14,500 + ($2,011 × 6 months) = $26,566 |

**Total Year 1 Cost (100k users):** ~$26,600

---

## 10. RISK ASSESSMENT & MITIGATION

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|-----------|
| **PDF Format Variations** | High | Medium | Parser testing with 10+ bank samples per variant |
| **Claude API Rate Limits** | Medium | Low | Batch processing, exponential backoff, queue system |
| **Data Loss** | Critical | Low | Daily backups, transaction logging, rollback capability |
| **Large File Uploads** | Medium | Medium | File size validation (10MB limit), chunked processing |
| **Performance Degradation** | Medium | Medium | Query indexing, caching, lazy loading charts |
| **Security Breach** | Critical | Low | SSL/TLS, input validation, SQL parameterization, OAuth |
| **Scope Creep** | High | High | Strict phase gates, change request process, stakeholder sign-off |

---

## 11. ASSUMPTIONS & CONSTRAINTS

### Assumptions
- Users have access to bank statements in PDF or Excel format
- Bank statement formats remain relatively stable (no major layout changes)
- Internet connectivity available for API calls
- Users comfortable uploading financial documents
- PostgreSQL available for local development

### Constraints
- MVP supports 3 banks only (ICICI, HDFC, Axis)
- Single-user accounts (no household sharing)
- 10MB max file size per upload
- Rate limits on Claude API (100 requests/min for batch)
- No real-time transaction sync (upload-based only)
- Transaction history not migrated from previous systems

---

## 12. SUCCESS CRITERIA

### Functional Success
- ✅ Phase 3.2: File upload working for 3+ bank formats
- [ ] Phase 3.3: AI categorization accuracy >85%
- [ ] Phase 3.4: Dashboard loading <2 seconds
- [ ] Phase 3.5: Custom categories fully functional
- [ ] Phase 3.6: Mobile responsive on all devices

### Quality Success
- [ ] All automated tests passing (unit + integration)
- [ ] Code coverage >80%
- [ ] ESLint & Prettier passing on all commits
- [ ] SonarCloud quality gates met
- [ ] Zero security vulnerabilities (OWASP)

### Performance Success
- [ ] Dashboard load time: <2s
- [ ] API response time: <500ms
- [ ] File upload: <30s for 10MB file
- [ ] Database query optimization: <100ms for analytics

### User Success
- [ ] Onboarding completion rate >90%
- [ ] Statement upload success rate >95%
- [ ] User retention >70% (first month)
- [ ] NPS score >40

---

## 13. APPROVAL & SIGN-OFF

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Project Owner | Shree Govinda | ____________ | ____________ |
| Tech Lead | Claude AI | ____________ | 2026-04-22 |
| QA Lead | TBD | ____________ | ____________ |

---

## 14. DOCUMENT HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-04-22 | Claude AI | Initial SOW creation |
| 1.1 | TBD | | Updates after phase reviews |

---

**Project Repository:** https://github.com/shreegovinda/financeanalytics  
**Project Status Page:** PROJECT_STATUS.md  
**Architecture Docs:** ARCHITECTURE.md (generated separately)
