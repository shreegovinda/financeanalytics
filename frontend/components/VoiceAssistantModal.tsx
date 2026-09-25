'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Recognition, recognitionConstructor, recognitionError, VoicePlayback } from '@/lib/voice';

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
  onAsk: (question: string) => Promise<VoiceAnswer | undefined>;
  locale: string;
}

export default function VoiceAssistantModal({ onClose, onAsk, locale }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const recognition = useRef<Recognition | null>(null);
  const playback = useRef(new VoicePlayback());
  const alive = useRef(true);
  const pending = useRef(false);
  const askLatest = useRef(onAsk);
  const audioEnabled = useRef(true);
  const continueListening = useRef(false);
  const [handsFree, setHandsFree] = useState(false);
  const [status, setStatus] = useState<'ready' | 'listening' | 'thinking' | 'speaking'>('ready');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [heard, setHeard] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [language, setLanguage] = useState(locale || 'en-IN');
  const [supported] = useState(() => Boolean(recognitionConstructor()));
  const bottom = useRef<HTMLDivElement>(null);
  useEffect(() => {
    askLatest.current = onAsk;
  }, [onAsk]);

  useEffect(() => {
    alive.current = true;
    dialog.current?.showModal();
    const player = playback.current;
    return () => {
      alive.current = false;
      continueListening.current = false;
      const mic = recognition.current;
      recognition.current = null;
      if (mic) {
        mic.onresult = mic.onerror = mic.onend = null;
        mic.abort();
      }
      player.stop();
    };
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [turns, heard, status]);

  function stopMic() {
    const mic = recognition.current;
    recognition.current = null;
    if (mic) {
      mic.onresult = mic.onerror = mic.onend = null;
      mic.abort();
    }
    setHeard('');
  }
  function pause() {
    audioEnabled.current = false;
    continueListening.current = false;
    setHandsFree(false);
    stopMic();
    playback.current.stop();
    if (!pending.current) setStatus('ready');
  }
  function speak(answer: string) {
    stopMic();
    setStatus('speaking');
    playback.current.speak(
      answer,
      language,
      () => {
        if (!alive.current) return;
        setStatus('ready');
        if (continueListening.current) startListening();
      },
      () => {
        if (!alive.current) return;
        continueListening.current = false;
        setHandsFree(false);
        setStatus('ready');
        setError('Audio could not play. Tap Read aloud to retry. Your answer is saved below.');
      },
    );
  }
  async function ask(question: string) {
    if (pending.current || !question.trim() || !alive.current) return;
    if (question.trim().length > 2000) {
      pause();
      setDraft(question.slice(0, 2000));
      setError('Please shorten your question to 2,000 characters.');
      return;
    }
    pending.current = true;
    audioEnabled.current = true;
    stopMic();
    playback.current.stop();
    setDraft(question);
    setError('');
    setStatus('thinking');
    try {
      const result = await askLatest.current(question.trim());
      if (!alive.current) return;
      if (!result) throw new Error('Unable to send your question. Please try again.');
      setTurns((previous) => [...previous, { question: question.trim(), result }]);
      setDraft('');
      pending.current = false;
      if (audioEnabled.current) speak(result.answer);
      else setStatus('ready');
    } catch (err) {
      if (!alive.current) return;
      setError(err instanceof Error ? err.message : 'Unable to answer. Please retry.');
      continueListening.current = false;
      setHandsFree(false);
      setStatus('ready');
    } finally {
      pending.current = false;
    }
  }
  function startListening() {
    if (pending.current || !alive.current) return;
    const Constructor = recognitionConstructor();
    if (!Constructor) return;
    stopMic();
    playback.current.stop();
    setError('');
    const mic = new Constructor();
    recognition.current = mic;
    mic.lang = language;
    mic.continuous = false;
    mic.interimResults = true;
    let finalText = '';
    let failed = false;
    mic.onresult = (event) => {
      if (recognition.current !== mic) return;
      let interim = '';
      finalText = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript + ' ';
        else interim += result[0].transcript;
      }
      setHeard((finalText + interim).trim());
    };
    mic.onerror = (event) => {
      if (recognition.current !== mic) return;
      failed = true;
      continueListening.current = false;
      setHandsFree(false);
      setError(recognitionError(event.error));
      setStatus('ready');
    };
    mic.onend = () => {
      if (recognition.current !== mic || !alive.current) return;
      recognition.current = null;
      setHeard('');
      if (!failed && finalText.trim()) void ask(finalText);
      else {
        setStatus('ready');
        continueListening.current = false;
        setHandsFree(false);
        if (!failed) setError(recognitionError('no-speech'));
      }
    };
    try {
      mic.start();
      setStatus('listening');
    } catch {
      mic.onerror({ error: 'audio-capture' });
      recognition.current = null;
    }
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
        <label className="flex flex-wrap items-center gap-3 text-sm">
          Speech language
          <select
            aria-label="Speech language"
            value={language}
            disabled={status !== 'ready'}
            onChange={(event) => setLanguage(event.target.value)}
            className="rounded-lg bg-slate-800 p-2"
          >
            {Array.from(
              new Set(
                [
                  locale,
                  'en-IN',
                  'en-US',
                  'hi-IN',
                  'kn-IN',
                  'ta-IN',
                  'te-IN',
                  'ml-IN',
                  'mr-IN',
                  'bn-IN',
                  'gu-IN',
                  'es-ES',
                  'fr-FR',
                  'de-DE',
                ].filter(Boolean),
              ),
            ).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-xl bg-indigo-950 p-5 text-center">
          <div
            aria-hidden="true"
            className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600 text-2xl ${status === 'listening' || status === 'speaking' ? 'motion-safe:animate-pulse' : ''}`}
          >
            ♪
          </div>
          <p role="status">
            {status === 'listening'
              ? 'Listening… finish your question to send it.'
              : status === 'thinking'
                ? 'Checking your records…'
                : status === 'speaking'
                  ? 'Finlytix is speaking…'
                  : 'Ready when you are'}
          </p>
          {heard && <p className="mt-3 text-indigo-200">{heard}</p>}
        </div>
        {!supported && (
          <p role="status" className="text-amber-200">
            Speech recognition is unavailable here. Type below, or open this page in a browser with
            speech recognition enabled.
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-950 p-3 text-sm text-red-100">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={!supported || status === 'thinking'}
            onClick={() => {
              playback.current.unlock();
              if (status === 'listening') recognition.current?.stop();
              else startListening();
            }}
            className="rounded-xl bg-indigo-600 px-4 py-3 font-semibold disabled:opacity-40"
          >
            {status === 'listening'
              ? 'Finish question'
              : status === 'speaking'
                ? 'Interrupt & speak'
                : 'Speak'}
          </button>
          <button onClick={pause} className="rounded-xl border border-slate-600 px-4 py-3">
            Pause voice
          </button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={handsFree}
              disabled={!supported}
              onChange={(event) => {
                continueListening.current = event.target.checked;
                setHandsFree(event.target.checked);
              }}
            />
            Listen again after each answer
          </label>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            playback.current.unlock();
            void ask(draft);
          }}
        >
          <input
            aria-label="Voice question"
            value={draft}
            maxLength={2000}
            disabled={status === 'thinking' || status === 'listening'}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Or type your question…"
            className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-900 p-3"
          />
          <button
            disabled={!draft.trim() || status === 'thinking' || status === 'listening'}
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
                disabled={status === 'thinking'}
                onClick={() => {
                  setError('');
                  speak(turn.result.answer);
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
