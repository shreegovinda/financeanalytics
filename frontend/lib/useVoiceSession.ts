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
  active?: boolean;
}

export function useVoiceSession({ language, onAsk, active = true }: Options) {
  const recognition = useRef<Recognition | null>(null);
  const playback = useRef(new VoicePlayback());
  const alive = useRef(true);
  const pending = useRef(false);
  const askLatest = useRef(onAsk);
  const languageLatest = useRef(language);
  const audioEnabled = useRef(true);
  const continueListening = useRef(false);
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
    stopMic();
    playback.current.stop();
    if (!pending.current) setStatus('ready');
  }, [stopMic]);
  const startListeningRef = useRef<() => void>(() => {});

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      continueListening.current = false;
      const mic = recognition.current;
      recognition.current = null;
      if (mic) {
        mic.onresult = mic.onerror = mic.onend = null;
        mic.abort();
      }
      playback.current.stop();
    };
  }, []);

  useEffect(() => {
    if (!active) pause();
  }, [active, pause]);

  const speak = useCallback(
    (answer: string) => {
      stopMic();
      setStatus('speaking');
      playback.current.speak(
        answer,
        languageLatest.current,
        () => {
          if (!alive.current) return;
          setStatus('ready');
          if (continueListening.current) startListeningRef.current();
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
    [stopMic],
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
        if (audioEnabled.current) speak(result.answer);
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
    stopMic();
    playback.current.stop();
    setError('');
    setNotice('');
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
      setStatus('listening');
    } catch {
      mic.onerror({ error: 'audio-capture' });
      recognition.current = null;
    }
  }, [ask, stopMic]);
  startListeningRef.current = startListening;

  const toggleListen = useCallback(() => {
    playback.current.unlock();
    if (status === 'listening') recognition.current?.stop();
    else startListening();
  }, [startListening, status]);

  const unlock = useCallback(() => {
    playback.current.unlock();
  }, []);

  const setHandsFreeListening = useCallback((enabled: boolean) => {
    continueListening.current = enabled;
    setHandsFree(enabled);
  }, []);

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
  };
}
