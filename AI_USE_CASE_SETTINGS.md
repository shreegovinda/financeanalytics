# Independent AI connections

Settings → AI Models & Keys has six independent connections: text chatbot, voice answers, statement extraction, transaction categorization, bill extraction and WhatsApp chatbot. There are no shared defaults. An unconfigured feature asks for setup.

Choose a provider, model and your own key (or an explicitly selected platform key) for each feature. The catalogue includes Gemini, Anthropic, OpenAI, Groq, DeepSeek and Mistral. Availability depends on the provider account; legacy and preview models may be restricted or retired.

**Validate & save** sends a small synthetic JSON prompt to the exact provider/model using the selected credential. No financial data is sent during validation. This may consume quota or credit. Invalid keys, inaccessible models, quota/billing problems, network errors and invalid structured responses prevent saving, with a safe error. The previous configuration remains unchanged. Validation confirms current access, not future quota or perfect extraction accuracy.

Changes apply to the next operation without an app restart. Requests already running retain their original connection. Voice recognition and playback remain browser speech services; the voice model generates the answer.

Keys are encrypted using the existing authenticated encryption service. API responses and exports exclude keys. Leaving the replacement key empty retains only this feature's key for the same provider. Disconnect removes this connection and its key; it does not restore defaults.

## Storage and API

`user_ai_use_cases` stores user/feature, provider, model, encrypted credential, masked hint and validation/update timestamps. Startup applies the idempotent schema. Previously explicit saved-key selections are copied into independent encrypted credentials; account defaults are not inherited. Account deletion cascades to these rows.

`GET /api/ai/use-cases` lists safe settings. `PUT /api/ai/use-cases/:useCase` validates before writing; `{ "clear": true }` disconnects. Resolution reads the database per operation. Concurrent validation is limited per user in the API process; multi-instance deployments should use a shared limiter.

## Verification

Unit tests use synthetic credentials and mocked transports to verify provider routing, validation failures, encrypted persistence, user/feature isolation and preservation of previous settings. The opt-in database integration test runs in a rolled-back transaction. Real provider access is checked when the user presses Validate & save.
