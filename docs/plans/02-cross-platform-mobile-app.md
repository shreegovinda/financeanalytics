# PLAN-02: Cross-Platform iOS & Android Mobile Applications

**Status**: Completed  
**Last Updated**: 2026-09-13  
**Authors**: Finlytix Core Engineering  

---

## 1. Objectives & Scope
1. **Native iOS & Android Architecture**:
   - Built with React Native and Expo in a monorepo workspace (`mobile/`).
   - Shared business logic, formatting, and DTO types via `@finlytix/shared`.
2. **Feature Parity with Web**:
   - **Dashboard**: Inflow/outflow cards, net cashflow, quick actions, and recent activity.
   - **Transactions**: Full ledger, search by description/merchant, category filter, and interactive category picker modal.
   - **Upload**: Native document picker (`expo-document-picker`) for PDF/XLSX statements and Camera receipt capture (`expo-image-picker`).
   - **Analytics**: Spend breakdown bars, net monthly cashflow comparison, and date filters.
   - **Ask Finlytix Copilot**: Conversational AI financial assistant with quick prompts.
   - **Settings Hub**: Unified settings (Profile, Regional Formats, AI Models & BYOK, Banks, Cost Transparency).
3. **Hardware & Security Capabilities**:
   - Biometric authentication (Face ID / Touch ID / Fingerprint) via `expo-local-authentication`.
   - Hardware-backed encrypted session storage via `expo-secure-store`.
   - Automatic session lock when app goes to background.

---

## 2. Directory Structure & Key Files
- `shared/`: Shared TypeScript library compiled to `shared/dist/`.
- `mobile/app/_layout.tsx`: Root layout with `AuthContext` and biometric app lock.
- `mobile/app/(tabs)/`: 5-tab bottom navigation (`index`, `transactions`, `upload`, `analytics`, `assistant`).
- `mobile/app/settings.tsx`: Unified settings hub.
- `mobile/lib/`: Secure storage, biometrics, theme, and API client.

---

## 3. Verification & Testing
- Shared package builds cleanly: `npm run build --workspace=shared`.
- TypeScript verification passes with 0 errors: `npx tsc --noEmit --project mobile/tsconfig.json`.
