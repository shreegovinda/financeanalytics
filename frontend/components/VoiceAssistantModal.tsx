'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
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
  const recognition = useRef<Recognition | null>(null);
  const playback = useRef(new VoicePlayback());
  const alive = useRef(true);
  const pending = useRef(false);
  const askLatest = useRef(onAsk);
  const audioEnabled = useRef(true);
  const continueListening = useRef(false);

  const [supported] = useState(() => Boolean(recognitionConstructor()));
  const [handsFree, setHandsFree] = useState(false);
  // Without speech recognition the modal opens idle rather than listening.
  const [status, setStatus] = useState<'ready' | 'listening' | 'thinking' | 'speaking'>(
    supported ? 'listening' : 'ready',
  );
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [heard, setHeard] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [language, setLanguage] = useState(locale || 'en-IN');
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    askLatest.current = onAsk;
  }, [onAsk]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [turns, heard, status]);

  // Handle ESC key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

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
        if (continueListening.current) {
          setTimeout(() => {
            if (alive.current) startListening();
          }, 400);
        }
      },
      () => {
        if (!alive.current) return;
        continueListening.current = false;
        setHandsFree(false);
        setStatus('ready');
        setError('Audio playback failed. Tap "Play Audio" to retry.');
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
    if (!Constructor) {
      setError(
        'Voice recognition is not supported in this browser. Please use Chrome, Edge, or Safari.',
      );
      setStatus('ready');
      return;
    }
    stopMic();
    playback.current.stop();
    setError('');
    playback.current.unlock();

    try {
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
        if (!failed && finalText.trim()) {
          void ask(finalText.trim());
        } else {
          setStatus('ready');
          continueListening.current = false;
          setHandsFree(false);
          if (!failed && !finalText.trim()) {
            setError(recognitionError('no-speech'));
          }
        }
      };

      mic.start();
      setStatus('listening');
    } catch (err) {
      console.warn('Speech recognition start failed:', err);
      setError('Could not start microphone. Check browser permissions.');
      setStatus('ready');
      recognition.current = null;
    }
  }

  // Start the microphone on mount and tear everything down on unmount.
  useEffect(() => {
    alive.current = true;
    const player = playback.current;

    const releaseMic = () => {
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

    if (!supported) {
      return releaseMic;
    }

    const timer = setTimeout(() => {
      if (alive.current) startListening();
    }, 300);

    return () => {
      clearTimeout(timer);
      releaseMic();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/65 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col rounded-3xl bg-white shadow-2xl overflow-hidden border border-slate-200/80"
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-modal-title"
      >
        {/* ── Header ── */}
        <header className="shrink-0 flex items-center justify-between border-b border-slate-100 bg-white/95 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-md shadow-indigo-100 text-white">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>
            <div>
              <h2 id="voice-modal-title" className="text-base font-bold text-slate-900">
                Finlytix Live Voice
              </h2>
              <p className="text-xs text-slate-500">
                Real-time financial queries linked to your settings
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-slate-100 p-2 text-slate-400 hover:bg-slate-200 hover:text-slate-800 transition-colors cursor-pointer"
            title="Close voice assistant"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {/* ── Interactive Visualizer Body ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-slate-50/70 to-white">
          <div className="flex flex-col items-center justify-center py-6">
            {/* Visualizer Sphere */}
            <div className="relative flex items-center justify-center w-36 h-36 mb-4">
              {/* Animated Glowing Wave Rings */}
              {status === 'listening' && (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] }}
                    transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
                    className="absolute inset-0 rounded-full bg-indigo-500/25 blur-sm"
                  />
                  <motion.div
                    animate={{ scale: [1, 1.5, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut', delay: 0.3 }}
                    className="absolute inset-2 rounded-full bg-violet-500/20 blur-md"
                  />
                </>
              )}
              {status === 'thinking' && (
                <div className="absolute inset-0 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
              )}
              {status === 'speaking' && (
                <motion.div
                  animate={{ scale: [0.95, 1.15, 0.95] }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                  className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-200 to-violet-200 opacity-60 blur-md"
                />
              )}

              {/* Main Interactive Mic Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={() => {
                  playback.current.unlock();
                  if (status === 'listening') {
                    recognition.current?.stop();
                  } else if (status === 'speaking') {
                    pause();
                  } else {
                    startListening();
                  }
                }}
                className={`relative z-10 flex h-24 w-24 items-center justify-center rounded-full shadow-xl transition-all cursor-pointer ${
                  status === 'listening'
                    ? 'bg-gradient-to-tr from-rose-500 to-red-600 text-white ring-4 ring-rose-200'
                    : status === 'speaking'
                      ? 'bg-gradient-to-tr from-indigo-600 to-violet-600 text-white ring-4 ring-indigo-200'
                      : status === 'thinking'
                        ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                        : 'bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white shadow-indigo-200'
                }`}
                title={
                  status === 'listening' ? 'Click to finish speaking' : 'Click to start speaking'
                }
              >
                {status === 'listening' ? (
                  <div className="flex items-center gap-1">
                    {[0.6, 1.2, 0.8, 1.4, 0.5].map((h, i) => (
                      <motion.span
                        key={i}
                        animate={{ height: ['8px', `${h * 24}px`, '8px'] }}
                        transition={{
                          repeat: Infinity,
                          duration: 0.6 + i * 0.1,
                          ease: 'easeInOut',
                        }}
                        className="w-1 bg-white rounded-full"
                      />
                    ))}
                  </div>
                ) : status === 'speaking' ? (
                  <div className="flex items-center gap-1">
                    {[1, 1.6, 1.2, 1.8, 0.8].map((h, i) => (
                      <motion.span
                        key={i}
                        animate={{ height: ['6px', `${h * 22}px`, '6px'] }}
                        transition={{
                          repeat: Infinity,
                          duration: 0.5 + i * 0.1,
                          ease: 'easeInOut',
                        }}
                        className="w-1 bg-white rounded-full"
                      />
                    ))}
                  </div>
                ) : (
                  <svg
                    className="w-9 h-9"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  </svg>
                )}
              </motion.button>
            </div>

            {/* Status indicator */}
            <p className="text-sm font-semibold text-slate-700 tracking-wide">
              {status === 'listening'
                ? 'Listening to your voice…'
                : status === 'thinking'
                  ? 'Consulting your financial model…'
                  : status === 'speaking'
                    ? 'Finlytix speaking…'
                    : 'Tap microphone to speak'}
            </p>

            {/* Live speech transcription */}
            <AnimatePresence>
              {status === 'listening' && heard && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 max-w-md text-center bg-white border border-indigo-100 rounded-2xl px-5 py-3 shadow-sm ring-1 ring-indigo-50"
                >
                  <p className="text-sm text-indigo-900 font-medium italic">
                    &ldquo;{heard}&rdquo;
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error banner */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-red-700 border border-red-100 max-w-md text-center text-xs"
                >
                  <span className="shrink-0">⚠️</span>
                  <span className="flex-1 font-medium">{error}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      startListening();
                    }}
                    className="font-bold underline hover:text-red-900 cursor-pointer ml-1"
                  >
                    Retry
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {!supported && (
              <div className="mt-3 max-w-md rounded-xl bg-amber-50 p-3 border border-amber-100 text-center text-xs text-amber-800">
                Speech recognition is not supported in this browser. You can type your question in
                the box below.
              </div>
            )}
          </div>

          {/* ── Conversation Turns ── */}
          {turns.length > 0 && (
            <section
              aria-label="Spoken turn history"
              className="space-y-4 border-t border-slate-200/80 pt-5 max-w-xl mx-auto"
            >
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Voice Exchange
              </h3>
              {turns.map((turn, i) => (
                <div key={i} className="space-y-2.5">
                  {/* User question on the left */}
                  <div className="flex justify-start">
                    <div className="rounded-2xl rounded-tl-sm bg-indigo-600 px-4 py-2.5 text-white max-w-[85%] shadow-sm text-sm">
                      <p>{turn.question}</p>
                    </div>
                  </div>
                  {/* AI answer slightly offset to the right */}
                  <div className="flex justify-start ml-6 sm:ml-8">
                    <div className="rounded-2xl rounded-tl-sm bg-white border border-slate-200 px-4 py-3 text-slate-800 max-w-[90%] shadow-sm text-sm">
                      <p className="whitespace-pre-wrap leading-relaxed">{turn.result.answer}</p>

                      {turn.result.sources && turn.result.sources.length > 0 && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap gap-1.5">
                          {turn.result.sources.map((source) => (
                            <Link
                              key={source.id}
                              href={source.href}
                              onClick={onClose}
                              className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                            >
                              {source.label}
                            </Link>
                          ))}
                        </div>
                      )}

                      <button
                        type="button"
                        disabled={status === 'thinking'}
                        onClick={() => {
                          setError('');
                          speak(turn.result.answer);
                        }}
                        className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M15.536 8.464a5 5 0 010 7.072m2.828-9.899a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                          />
                        </svg>
                        Play Audio
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <div ref={bottom} />
            </section>
          )}
        </div>

        {/* ── Footer Controls ── */}
        <footer className="shrink-0 border-t border-slate-100 bg-white p-4 sm:p-5">
          <div className="max-w-xl mx-auto space-y-3">
            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 font-medium text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={handsFree}
                  disabled={!supported}
                  onChange={(e) => {
                    continueListening.current = e.target.checked;
                    setHandsFree(e.target.checked);
                  }}
                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                Hands-free conversation mode
              </label>

              <select
                aria-label="Speech language"
                value={language}
                disabled={status !== 'ready'}
                onChange={(e) => setLanguage(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-700 focus:outline-none cursor-pointer"
              >
                {Array.from(new Set([locale, 'en-IN', 'en-US', 'hi-IN']))
                  .filter(Boolean)
                  .map((val) => (
                    <option key={val} value={val}>
                      {val}
                    </option>
                  ))}
              </select>
            </div>

            {/* Manual Text Fallback Form */}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                playback.current.unlock();
                void ask(draft);
              }}
            >
              <input
                aria-label="Voice question text"
                value={draft}
                maxLength={2000}
                disabled={status === 'thinking'}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Or type a question manually…"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs sm:text-sm text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!draft.trim() || status === 'thinking'}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Send
              </button>
            </form>
          </div>
        </footer>
      </motion.div>
    </div>
  );
}
