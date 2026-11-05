# Interactive voice assistant

Open `/assistant`, select **Talk to Finlytix**, then **Speak**. Allow microphone access when your browser asks. Finish speaking (or select **Finish question**) to send the question. Enable **Listen again after each answer** for a continuing conversation. **Interrupt & speak** stops playback and starts a new question. **Pause voice** stops recording/playback and automatic listening; **End voice** closes the dialog.

The Help page chatbot reuses the same browser speech loop. Typed product questions remain available. Enable **Voice mode**, choose a speech language, then **Speak**. The spoken question is transcribed, answered from the product guide (`scope=help` on `/api/chat`), and read aloud. **Read aloud** works without leaving typed chat. The selected language is stored in `localStorage` (`finlytix-speech-language`) and is sent to `/api/chat` so the model can reply in that language.

Questions use the same authenticated `/api/chat` endpoint as text chat, including user-scoped read-only data tools, selected AI provider/personal key, request validation, concurrency guard, history persistence, evidence, and source links. Help-page questions skip finance tools and stay on the product guide. The last six chat messages provide follow-up context. Voice answers remain available in saved history and its existing deletion controls. Closing voice during a pending request stops audio immediately; the request still completes and saves to chat.

This is turn-based voice interaction, not a full-duplex Gemini Live session. Browser speech recognition transcribes one question at a time and speech synthesis reads the answer in bounded chunks. Recognition is stopped during playback to avoid recording the assistant itself. No extra Gemini Live key or speech backend is needed. The experimental WebSocket and unofficial Google Translate speech endpoint were removed.

## Indian language support

Speech-to-text and text-to-speech both use the browser Web Speech API (Chrome/Edge typically call Google speech). Finlytix does not add a separate STT/TTS vendor. Typical Chromium support:

| Language | BCP-47 | STT | TTS |
| --- | --- | --- | --- |
| English (India) | `en-IN` | Expected | Expected |
| Hindi | `hi-IN` | Expected | Expected |
| Bengali | `bn-IN` | Expected | Expected when a `bn`/`bn-IN` voice is installed |
| Telugu | `te-IN` | Expected | Expected when a `te` voice is installed |
| Marathi | `mr-IN` | Expected | Expected when an `mr` voice is installed |
| Tamil | `ta-IN` | Expected | Expected when a `ta` voice is installed |
| Gujarati | `gu-IN` | Expected | Expected when a `gu` voice is installed |
| Kannada | `kn-IN` | Expected | Expected when a `kn` voice is installed |
| Malayalam | `ml-IN` | Expected | Expected when an `ml` voice is installed |
| Punjabi | `pa-IN` | Expected (`pa-Guru-IN` fallback) | Often missing on desktop; gap is shown |
| Odia | `or-IN` | Limited; browser may reject the language | Often missing; gap is shown |
| Urdu | `ur-IN` | Expected (`ur-PK` fallback) | Often missing on desktop; gap is shown |
| Assamese | `as-IN` | Limited; included when the browser offers it | Often missing; gap is shown |

If recognition returns `language-not-supported`, or no matching synthesis voice exists, the UI explains that instead of failing silently. Typed chat still works. Firefox generally lacks Web Speech recognition; Safari support is incomplete.

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
