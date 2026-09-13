# PLAN-03: User Cost Transparency & Resource Footprint

**Status**: Completed  
**Last Updated**: 2026-09-13  
**Authors**: Finlytix Core Engineering  

---

## 1. Objectives & Scope
1. **User Information Rights Commitment**:
   - Provide an open, itemized breakdown of cloud infrastructure, database compute, encrypted vault storage, and AI processing expended on behalf of each user.
2. **Itemized Accounting Model**:
   - AI statement extraction: $0.015 / statement.
   - AI categorization: $0.00008 / transaction.
   - AI chat assistant: $0.0025 / message.
   - Encrypted vault storage: $0.023 / GB-month, calculated dynamically from encrypted statement files via database length checks (`COALESCE(SUM(LENGTH(content)), 0)`).
   - PostgreSQL ledger compute: $0.000005 / transaction and chat operation.
3. **Personal Key BYOK Guarantee**:
   - When personal AI key mode is active (`ai_key_mode === 'personal'`), platform AI cost is strictly highlighted as **$0.00 / ₹0.00** with an active *"Personal Key Active — Zero Platform AI Cost"* badge.
4. **Currency Adaptation**:
   - Automatically converts costs into the user's selected regional currency (`INR`, `USD`, `EUR`, `GBP`, `AED`, `SGD`, etc.) using real-time rates.

---

## 2. Architecture & File Locations
- **Backend Service**: `backend/services/costTransparencyService.js`
- **Protected Endpoint**: `GET /api/account/cost-transparency` in `backend/routes/accountClosure.js`
- **Shared Types**: `CostTransparency` in `shared/src/types/index.ts`
- **Web UI**: Dedicated card in `frontend/app/settings/page.tsx` under Profile & Account.
- **Mobile UI**: Native Cost Transparency card in `mobile/app/settings.tsx`.

---

## 3. Verification & Testing
- Backend unit tests: `backend/test/cost-transparency.test.js`.
- Webpack production build: `npm run build --workspace=frontend -- --webpack`.
- Mobile TypeScript check: `npx tsc --noEmit --project mobile/tsconfig.json`.
