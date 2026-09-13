# Finlytix Implementation Plans & Architecture Specifications

This directory serves as the persistent repository of truth for all architectural designs, implementation plans, and technical specifications for Finlytix. Whenever a plan evolves or new requirements are introduced, this repository is updated to maintain full traceability.

---

## 📋 Implementation Plans Index

| ID | Title | Status | Scope / Component | Document Link |
|---|---|---|---|---|
| **PLAN-01** | Platform Foundation, Privacy & Modernization | **Completed** | Security, Encryption, BYOK, Exports, Auditing | [01-platform-foundation-and-security.md](./01-platform-foundation-and-security.md) |
| **PLAN-02** | Cross-Platform iOS & Android Mobile Apps | **Completed** | React Native, Expo, Biometrics, `@finlytix/shared` | [02-cross-platform-mobile-app.md](./02-cross-platform-mobile-app.md) |
| **PLAN-03** | Cost Transparency & Resource Footprint | **Completed** | User Information Rights, Itemized Incurred Costs, BYOK \$0 Badge | [03-cost-transparency-and-footprint.md](./03-cost-transparency-and-footprint.md) |
| **PLAN-04** | WhatsApp Platform Integration | **Completed** | Document Ingestion, OTP Auth, AI Copilot on WhatsApp | [04-whatsapp-integration.md](./04-whatsapp-integration.md) |
| **PLAN-05** | Sensitive Data Encryption at Rest | **Completed** | AES-256-GCM Column Encryption, Blind Indexing, Zero DBA Plaintext | [05-sensitive-data-encryption-at-rest.md](./05-sensitive-data-encryption-at-rest.md) |

---

## 🔄 Governance & Change Management Policy

1. **Version Control**: Every architectural change or scope adjustment must update the corresponding plan document in this folder alongside the brain artifact `implementation_plan.md`.
2. **Backward Compatibility**: Any changes to API contracts or shared types must preserve compatibility between Web (`frontend/`) and Mobile (`mobile/`).
3. **Quality Gate Requirement**: Plans are only marked **Completed** after:
   - Automated unit and integration tests pass (`npm test --workspace=backend`).
   - TypeScript compilation passes across all workspaces (`shared`, `frontend`, `mobile`).
   - Code formatting (`npm run format:check`) and linter checks (`npm run lint`) pass with 0 errors and 0 warnings.
   - Production build succeeds (`npm run build --workspace=frontend`).
