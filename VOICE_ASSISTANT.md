# Interactive voice assistant

Open `/assistant`, select **Talk to Finlytix**, then **Speak**. Allow microphone access when your browser asks. Finish speaking (or select **Finish question**) to send the question. Enable **Listen again after each answer** for a continuing conversation. **Interrupt & speak** stops playback and starts a new question. **Pause voice** stops recording/playback and automatic listening; **End voice** closes the dialog.

Questions use the same authenticated `/api/chat` endpoint as text chat, including user-scoped read-only data tools, selected AI provider/personal key, request validation, concurrency guard, history persistence, evidence, and source links. The last six chat messages provide follow-up context. Voice answers remain available in saved history and its existing deletion controls. Closing voice during a pending request stops audio immediately; the request still completes and saves to chat.

This is turn-based voice interaction, not a full-duplex Gemini Live session. Browser speech recognition transcribes one question at a time and speech synthesis reads the answer in bounded chunks. Recognition is stopped during playback to avoid recording the assistant itself. No extra Gemini Live key or speech backend is needed. The experimental WebSocket and unofficial Google Translate speech endpoint were removed.

## Browser support and privacy

Speech recognition availability depends on browser, OS, language, permissions, and speech-service connectivity. Use HTTPS outside localhost. Unsupported browsers display a typed-question fallback. Permission failures, missing microphones, no speech, and network failures have visible recovery messages. Playback failures offer **Read aloud**, a direct user gesture, instead of leaving the interface silently waiting.

Browser speech services may process audio remotely. Finlytix does not upload or retain audio recordings; recognized text and answers are saved using normal chat history. Speech output uses a matching local device voice when available; otherwise the browser may use a remote voice. The modal explains this before starting the microphone.

## Validation

Run `npm run test:voice`, `npm run lint`, and `npm run build --workspace=frontend -- --webpack`.

Manual checks on a signed-in browser with a real microphone:

1. Speak a financial question and verify its answer and source links against text chat.
2. Ask a follow-up, then refresh chat history: both turns should remain.
3. Enable automatic listening; confirm it starts only after playback finishes.
4. Interrupt playback and ask again. Pause during a pending answer: it should appear without speaking.
5. End voice while listening, speaking, and waiting. No microphone/playback should remain active.
6. Deny microphone permission or use an unsupported browser; typed questions must remain usable.
7. Check blocked playback recovery via Read aloud, mobile layout, Escape, and keyboard focus containment.

Automated tests cover playback cancellation, stale callbacks, speech completion, blocked playback, absent browser APIs, recognition errors, amount-preserving speech formatting, and the existing chat history/security behavior. Physical microphone capture and audible output still require manual verification on the target device.
