'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import SpeechLanguageSelect from '@/components/SpeechLanguageSelect';
import { useVoiceSession } from '@/lib/useVoiceSession';
import { languageSelectOptions, loadSpeechLanguage, saveSpeechLanguage } from '@/lib/voice';

interface VoiceAnswer {
  answer: string;
  sources: { id: string; label: string; href: string }[];
}
interface Turn {
  question: string;
  result: VoiceAnswer;
}
interface Props {
  onClose: () => void;
  onAsk: (question: string, language: string) => Promise<VoiceAnswer | undefined>;
  locale: string;
}

export default function VoiceAssistantModal({ onClose, onAsk, locale }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [language, setLanguage] = useState(() => loadSpeechLanguage(locale || 'en-IN'));
  const [turns, setTurns] = useState<Turn[]>([]);
  const options = useMemo(() => languageSelectOptions([locale]), [locale]);
  const languageRef = useRef(language);
  languageRef.current = language;
  const voice = useVoiceSession({
    language,
    onAsk: async (question) => {
      const result = await onAsk(question, languageRef.current);
      if (result) setTurns((previous) => [...previous, { question, result }]);
      return result;
    },
  });
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [turns, voice.heard, voice.status]);

  function changeLanguage(code: string) {
    setLanguage(code);
    saveSpeechLanguage(code);
  }

  return (
    <dialog
      ref={dialog}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      aria-labelledby="voice-title"
      className="m-auto w-[calc(100%-2rem)] max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl bg-slate-950 p-0 text-white shadow-2xl backdrop:bg-slate-950/70"
    >
      <header className="flex items-center justify-between gap-3 border-b border-slate-700 p-5">
        <div>
          <h2 id="voice-title" className="text-xl font-semibold">
            Talk to Finlytix
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Ask about your finances. Follow up naturally.
          </p>
        </div>
        <button
          autoFocus
          onClick={onClose}
          className="rounded-lg border border-slate-600 px-3 py-2"
        >
          End voice
        </button>
      </header>
      <div className="space-y-4 p-5">
        <p className="text-xs leading-5 text-slate-400">
          Your browser provides speech recognition and playback and may use its own speech service.
          Questions use your selected AI provider. Text and answers are saved in your chat history;
          Finlytix does not store voice recordings.
        </p>
        <SpeechLanguageSelect
          value={language}
          onChange={changeLanguage}
          options={options}
          disabled={voice.status !== 'ready'}
          selectClassName="rounded-lg bg-slate-800 p-2"
        />
        <div className="rounded-xl bg-indigo-950 p-5 text-center">
          <div
            aria-hidden="true"
            className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-2xl ${voice.status === 'listening' || voice.status === 'speaking' ? 'motion-safe:animate-pulse' : ''}`}
          >
            ♪
          </div>
          <p role="status">
            {voice.status === 'listening'
              ? 'Listening… finish your question to send it.'
              : voice.status === 'thinking'
                ? 'Checking your records…'
                : voice.status === 'speaking'
                  ? 'Finlytix is speaking…'
                  : 'Ready when you are'}
          </p>
          {voice.heard && <p className="mt-3 text-indigo-200">{voice.heard}</p>}
        </div>
        {!voice.supported && (
          <p role="status" className="text-amber-200">
            Speech recognition is unavailable here. Type below, or open this page in a browser with
            speech recognition enabled.
          </p>
        )}
        {voice.notice && (
          <p role="status" className="rounded-lg bg-amber-950 p-3 text-sm text-amber-100">
            {voice.notice}
          </p>
        )}
        {voice.error && (
          <p role="alert" className="rounded-lg bg-red-950 p-3 text-sm text-red-100">
            {voice.error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={!voice.supported || voice.status === 'thinking'}
            onClick={voice.toggleListen}
            className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold disabled:opacity-40"
          >
            {voice.status === 'listening'
              ? 'Finish question'
              : voice.status === 'speaking'
                ? 'Interrupt & speak'
                : 'Speak'}
          </button>
          <button onClick={voice.pause} className="rounded-xl border border-slate-600 px-4 py-3">
            Pause voice
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={voice.handsFree}
              disabled={!voice.supported}
              onChange={(event) => voice.setHandsFreeListening(event.target.checked)}
            />
            Listen again after each answer
          </label>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            voice.unlock();
            void voice.ask(voice.draft);
          }}
        >
          <input
            aria-label="Voice question"
            value={voice.draft}
            maxLength={2000}
            disabled={voice.status === 'thinking' || voice.status === 'listening'}
            onChange={(event) => voice.setDraft(event.target.value)}
            placeholder="Or type your question…"
            className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 p-3"
          />
          <button
            disabled={
              !voice.draft.trim() || voice.status === 'thinking' || voice.status === 'listening'
            }
            className="rounded-lg bg-indigo-600 px-4 disabled:opacity-40"
          >
            Ask
          </button>
        </form>
        <section aria-label="Voice conversation" className="space-y-4">
          {turns.map((turn, i) => (
            <article key={i} className="space-y-3 rounded-xl border border-slate-700 p-4">
              <p className="text-indigo-200">You: {turn.question}</p>
              <p className="whitespace-pre-wrap text-sm leading-6">{turn.result.answer}</p>
              <nav aria-label="Supporting records" className="flex flex-wrap gap-3">
                {turn.result.sources.map((source) => (
                  <Link
                    key={source.id}
                    href={source.href}
                    onClick={onClose}
                    className="text-sm text-indigo-300 underline"
                  >
                    {source.label}
                  </Link>
                ))}
              </nav>
              <button
                disabled={voice.status === 'thinking'}
                onClick={() => {
                  voice.setError('');
                  voice.speak(turn.result.answer);
                }}
                className="text-sm text-indigo-300 underline disabled:opacity-40"
              >
                Read aloud
              </button>
            </article>
          ))}
          <div ref={bottom} />
        </section>
        <p className="text-xs text-slate-400">
          You can revisit or delete these messages in saved chat history. Ending voice stops the
          microphone and playback. An answer already in progress will finish and save to chat.
        </p>
      </div>
    </dialog>
  );
}
