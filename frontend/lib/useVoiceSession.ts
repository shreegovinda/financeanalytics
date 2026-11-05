'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Recognition,
  recognitionConstructor,
  recognitionError,
  recognitionLangFor,
  VoicePlayback,
} from '@/lib/voice';

export type VoiceStatus = 'ready' | 'listening' | 'thinking' | 'speaking';

export interface VoiceAskResult {
  answer: string;
}

interface Options {
  language: string;
  onAsk: (question: string) => Promise<VoiceAskResult | undefined>;
}

export function useVoiceSession({ language, onAsk }: Options) {
  const recognition = useRef<Recognition | null>(null);
  const playback = useRef(new VoicePlayback());
  const alive = useRef(true);
  const pending = useRef(false);
  const askLatest = useRef(onAsk);
  const languageLatest = useRef(language);
  const audioEnabled = useRef(true);
  const continueListening = useRef(false);
  const listenAgainTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const micStartRetry = useRef(false);
  const [handsFree, setHandsFree] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>('ready');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState('');
  const [heard, setHeard] = useState('');
  const [supported] = useState(() => Boolean(recognitionConstructor()));

  useEffect(() => {
    askLatest.current = onAsk;
  }, [onAsk]);
  useEffect(() => {
    languageLatest.current = language;
  }, [language]);

  const cancelListenAgain = useCallback(() => {
    clearTimeout(listenAgainTimer.current);
    listenAgainTimer.current = undefined;
  }, []);

  const stopMic = useCallback(() => {
    const mic = recognition.current;
    recognition.current = null;
    if (mic) {
      mic.onresult = mic.onerror = mic.onend = null;
      mic.abort();
    }
    setHeard('');
  }, []);

  const pause = useCallback(() => {
    audioEnabled.current = false;
    continueListening.current = false;
    setHandsFree(false);
    cancelListenAgain();
    stopMic();
    playback.current.stop();
    if (!pending.current) setStatus('ready');
  }, [cancelListenAgain, stopMic]);
  const startListeningRef = useRef<() => void>(() => {});

  useEffect(() => {
    alive.current = true;
    const player = playback.current;
    return () => {
      alive.current = false;
      continueListening.current = false;
      clearTimeout(listenAgainTimer.current);
      listenAgainTimer.current = undefined;
      const mic = recognition.current;
      recognition.current = null;
      if (mic) {
        mic.onresult = mic.onerror = mic.onend = null;
        mic.abort();
      }
      player.stop();
    };
  }, []);

  const speak = useCallback(
    (answer: string, spokenLanguage?: string) => {
      cancelListenAgain();
      stopMic();
      setStatus('speaking');
      playback.current.speak(
        answer,
        spokenLanguage ?? languageLatest.current,
        () => {
          if (!alive.current) return;
          setStatus('ready');
          if (continueListening.current) {
            listenAgainTimer.current = setTimeout(() => {
              listenAgainTimer.current = undefined;
              if (alive.current && continueListening.current) startListeningRef.current();
            }, 400);
          }
        },
        () => {
          if (!alive.current) return;
          continueListening.current = false;
          setHandsFree(false);
          setStatus('ready');
          setError('Audio could not play. Tap Read aloud to retry. Your answer is saved below.');
        },
        (message) => {
          if (alive.current) setNotice(message);
        },
      );
    },
    [cancelListenAgain, stopMic],
  );

  const ask = useCallback(
    async (question: string) => {
      if (pending.current || !question.trim() || !alive.current) return;
      if (question.trim().length > 2000) {
        pause();
        setDraft(question.slice(0, 2000));
        setError('Please shorten your question to 2,000 characters.');
        return;
      }
      pending.current = true;
      audioEnabled.current = true;
      const replyLanguage = languageLatest.current;
      stopMic();
      playback.current.stop();
      setDraft(question);
      setError('');
      setNotice('');
      setStatus('thinking');
      try {
        const result = await askLatest.current(question.trim());
        if (!alive.current) return;
        if (!result) throw new Error('Unable to send your question. Please try again.');
        setDraft('');
        pending.current = false;
        if (audioEnabled.current) speak(result.answer, replyLanguage);
        else setStatus('ready');
        return result;
      } catch (err) {
        if (!alive.current) return;
        setError(err instanceof Error ? err.message : 'Unable to answer. Please retry.');
        continueListening.current = false;
        setHandsFree(false);
        setStatus('ready');
      } finally {
        pending.current = false;
      }
    },
    [pause, speak, stopMic],
  );

  const startListening = useCallback(() => {
    if (pending.current || !alive.current) return;
    const Constructor = recognitionConstructor();
    if (!Constructor) return;
    cancelListenAgain();
    stopMic();
    playback.current.stop();
    setError('');
    setNotice('');
    playback.current.unlock();
    const mic = new Constructor();
    recognition.current = mic;
    mic.lang = recognitionLangFor(languageLatest.current);
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
      micStartRetry.current = false;
      setStatus('listening');
    } catch {
      // start() throws InvalidStateError when a previous session has not finished
      // ending — not a missing microphone.
      recognition.current = null;
      mic.onresult = mic.onerror = mic.onend = null;
      if (!micStartRetry.current) {
        micStartRetry.current = true;
        listenAgainTimer.current = setTimeout(() => {
          listenAgainTimer.current = undefined;
          if (alive.current && !pending.current) startListeningRef.current();
        }, 200);
        return;
      }
      micStartRetry.current = false;
      continueListening.current = false;
      setHandsFree(false);
      setStatus('ready');
      setError(recognitionError('aborted'));
    }
  }, [ask, cancelListenAgain, stopMic]);
  useEffect(() => {
    startListeningRef.current = startListening;
  }, [startListening]);

  const statusRef = useRef<VoiceStatus>('ready');
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Changing the language mid-conversation takes effect immediately: restart the
  // microphone in the new language after the previous recognizer ends, stop speech
  // that is still playing in the old one, or skip speaking an in-flight reply.
  const applyLanguage = useCallback(
    (code: string) => {
      languageLatest.current = code;
      if (statusRef.current === 'listening') {
        const mic = recognition.current;
        recognition.current = null;
        setHeard('');
        let resumed = false;
        const resume = () => {
          if (resumed) return;
          resumed = true;
          if (mic) mic.onend = null;
          cancelListenAgain();
          micStartRetry.current = false;
          // Chrome cannot start() until the previous session's end event has settled.
          listenAgainTimer.current = setTimeout(() => {
            listenAgainTimer.current = undefined;
            if (alive.current && !pending.current) startListeningRef.current();
          }, 0);
        };
        if (!mic) {
          resume();
          return;
        }
        mic.onresult = mic.onerror = null;
        mic.onend = resume;
        try {
          mic.abort();
        } catch {
          resume();
          return;
        }
        if (!resumed) listenAgainTimer.current = setTimeout(resume, 400);
      } else if (statusRef.current === 'speaking') {
        playback.current.stop();
        setStatus('ready');
        if (continueListening.current) startListeningRef.current();
      } else if (statusRef.current === 'thinking') {
        // The in-flight /api/chat reply was requested in the previous language.
        // Do not read it aloud with the newly selected voice.
        audioEnabled.current = false;
      }
    },
    [cancelListenAgain],
  );

  const toggleListen = useCallback(() => {
    playback.current.unlock();
    if (status === 'listening') recognition.current?.stop();
    else startListening();
  }, [startListening, status]);

  const unlock = useCallback(() => {
    playback.current.unlock();
  }, []);

  const setHandsFreeListening = useCallback(
    (enabled: boolean) => {
      continueListening.current = enabled;
      setHandsFree(enabled);
      if (!enabled) cancelListenAgain();
    },
    [cancelListenAgain],
  );

  return {
    supported,
    status,
    error,
    notice,
    draft,
    setDraft,
    heard,
    handsFree,
    setHandsFreeListening,
    ask,
    speak,
    pause,
    toggleListen,
    startListening,
    unlock,
    setError,
    applyLanguage,
  };
}
