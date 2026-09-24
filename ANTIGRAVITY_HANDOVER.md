# Finlytix → Antigravity handover

Snapshot: 24 September 2026.

## Start here

- Work only in `/Users/shreegovinda/Desktop/Projects/financeanalytics`.
- Branch: `feature/assistant-conversations-ai-connections`.
- PR: https://github.com/shreegovinda/financeanalytics/pull/42 → `master`.
- Feature commit: `55a7494`; this handover is a subsequent documentation commit.
- PR #41 is merged. PR #42 was open, with Code Quality and Cursor Bugbot still running when this handover was written. Recheck their live results.
- All implementation changes are committed and pushed. Do not reset local work or copy environments into another checkout.

## What was implemented

### Separate chats and layout

The assistant header/back navigation and composer stay visible while only messages scroll. Desktop has a conversation sidebar; mobile has a horizontal chat list. New chat creates a conversation on the first question. Its encrypted title comes from the first 80 characters, without an AI request.

Every conversation has its own persisted messages/context and delete control with confirmation. Existing ungrouped messages appear as Saved history. Voice uses the selected chat. Switching and deletion are disabled while answering or in voice mode. Backend queries enforce ownership; the composite foreign key cascades message deletion. A deleted chat cannot be recreated by a late answer. Exports include conversation metadata.

Read `CHAT_CONVERSATIONS.md`, `frontend/app/assistant/page.tsx`, `backend/routes/chat.js`, and `backend/services/chatHistory.js`.

### Independent AI connections

Settings → AI Models & Keys has six independent connections: text chat, voice answers, statement extraction, categorization, bill extraction, and WhatsApp chat. There are no inherited defaults. Unconfigured features require setup.

The catalogue contains six providers and 19 models: Gemini, Anthropic, OpenAI, Groq, DeepSeek, and Mistral. Each feature uses its explicitly selected platform key or encrypted personal key. Validate & save makes a small synthetic JSON request before writing. It sends no financial data but may consume quota/credit. Safe errors cover rejected keys, model access, quota, billing, connectivity and response format. Failed validation preserves the old connection. Successful changes apply to the next operation; in-flight work retains the old choice.

Read `AI_USE_CASE_SETTINGS.md`, `frontend/components/AiUseCaseSettings.tsx`, `backend/config/aiCatalogue.js`, `backend/services/aiUseCases.js`, `backend/services/aiValidation.js`, and `backend/services/ai.js`. The legacy settings endpoints remain for compatibility; feature execution resolves explicit per-use-case settings.

### Interactive voice

Voice uses browser speech recognition/synthesis, with text questions routed through the normal authenticated chat API. Text and answers persist; audio recordings are not stored by Finlytix. Browser speech may use external speech services. This is not Gemini Live audio. Controls include speak, pause, optional automatic listening, language, and typed fallback. Safe provider errors and deterministic multilingual greetings were added.

Read `VOICE_ASSISTANT.md`, `frontend/components/VoiceAssistantModal.tsx`, `frontend/lib/voice.ts`, and `backend/services/chatErrors.js`.

## Database and local startup

`backend/db/schema.sql` adds `user_ai_use_cases`, `chat_conversations`, and the message conversation reference. Startup applies schema idempotently. The schema was applied to the local development database. Existing explicit shared-key selections are copied into independent encrypted keys; no shared defaults are seeded. Account deletion cascades.

Use existing local environments without printing their contents. Default local ports are frontend 3000/backend 3001; check existing listeners first and match NEXT_PUBLIC_API_URL and FRONTEND_URL if using different ports.

From the project root, in separate terminals:

```sh
npm run dev:backend
npm run dev:frontend
```

PostgreSQL must be running. Do not create replacement credentials or overwrite `.env.local` files.

## Completed validation

- Full backend regression: 201 passed, 4 skipped.
- `npm run test:voice`: 18 passed.
- Opt-in AI settings and conversation PostgreSQL integration tests passed. They cover encrypted persistence, user/feature isolation, chat scoping, cascading deletion, and late-answer rejection using synthetic records.
- `npm run lint`, `npm run format:check`, frontend TypeScript, `npm run typecheck:mobile`, and Next production build passed.
- Provider adapter tests mock outbound calls; actual account/model access is checked when the user presses Validate & save.

Relevant commands:

```sh
npm run lint
npm run format:check
npm test
npm run test:voice
RUN_LOCAL_DB_TESTS=1 node --test backend/test/ai-use-cases.integration.test.js backend/test/chat-history.integration.test.js
npm run typecheck:mobile
npm run build
```

Integration tests require a local development database. Do not run them against production.

## Next actions

1. Check PR #42 CI and review comments, resolve actionable issues, and push fixes to the same branch. Do not merge without user direction.
2. Perform signed-in browser visual checks: desktop/mobile, long histories with sticky header/composer, creating/switching chats, refresh persistence, deletion of selected and other chats, and Saved history compatibility.
3. Check real microphone/playback on target browsers/devices, permission denial, language selection, pause/end controls, and voice questions saved to the selected chat. Browser speech support varies; avoid claiming universal support.
4. With the user's selected provider/account, validate a connection and check a safe question. Do not use real financial prompts merely for diagnostics or silently consume paid quota.
5. Consider shared rate limiting if deploying several API instances: current connection-validation concurrency guard is process-local.

The UI has compiled successfully but signed-in visual/device testing remains outstanding. Physical microphone/playback has not been certified on all target browsers. AI model availability can change; successful validation is not a guarantee of future quota or answer accuracy.

## Security and scope

Never commit or print `.env*`, API/SMTP keys, OTPs, database dumps, statements, generated private reports, or `.local-migration-backup/`. Chat titles/messages/results and personal keys use the existing encryption service. Development test runs warn when a production-grade APP_ENCRYPTION_KEY is absent; keep deployment key management explicit.

`PLATFORM_ROADMAP.md` retains historical requests, not verified completion claims. Legal identity/retention decisions remain configurable and should not be invented. This handover does not re-verify SMTP, legal compliance, or the rest of the historical platform roadmap.
