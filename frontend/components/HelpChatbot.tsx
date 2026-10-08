'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SpeechLanguageSelect from '@/components/SpeechLanguageSelect';
import { getAiProviderHeaders } from '@/lib/aiProvider';
import { apiFetch, getErrorMessage } from '@/lib/api';
import { useVoiceSession } from '@/lib/useVoiceSession';
import {
  languageSelectOptions,
  loadSpeechLanguage,
  saveSpeechLanguage,
  SPEECH_LANGUAGES,
} from '@/lib/voice';

interface HelpAnswer {
  answer: string;
  sources: { id: string; label: string; href: string }[];
}
interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: HelpAnswer['sources'];
}

const chatApi = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chat`;

function hasToken(): boolean {
  return typeof window !== 'undefined' && Boolean(localStorage.getItem('token'));
}

export default function HelpChatbot() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);
  const [language, setLanguage] = useState('en-IN');
  const [voiceMode, setVoiceMode] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const conversationRef = useRef(conversationId);
  conversationRef.current = conversationId;
  const options = useMemo(() => languageSelectOptions([], true), []);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSignedIn(hasToken());
    setLanguage(loadSpeechLanguage());
  }, []);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, pending]);

  const postQuestion = useCallback(
    async (question: string): Promise<HelpAnswer | undefined> => {
      const token = localStorage.getItem('token');
      if (!token) {
        router.replace('/auth');
        return;
      }
      setBusy(true);
      setError('');
      setPending(question);
      try {
        let id = conversationRef.current;
        if (!id) {
          const created = await apiFetch(`${chatApi}/conversations`, {
            method: 'POST',
            retries: 0,
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              title: `Help: ${question.trim()}`.slice(0, 80),
            }),
          });
          if (!created.ok) throw new Error('Unable to start a help conversation.');
          const chat = await created.json();
          id = chat.id;
          setConversationId(chat.id);
          conversationRef.current = chat.id;
        }
        const history = messagesRef.current
          .slice(-6)
          .map(({ role, content }) => ({ role, content }));
        const response = await apiFetch(chatApi, {
          method: 'POST',
          retries: 0,
          timeout: 250000,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...getAiProviderHeaders(),
          },
          body: JSON.stringify({
            message: question,
            conversationId: id,
            history,
            useCase: voiceMode ? 'voice_chat' : 'text_chat',
            scope: 'help',
            language: languageRef.current,
          }),
        });
        if (response.status === 401) {
          router.replace('/auth');
          return;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to answer');
        setMessages((previous) => [
          ...previous,
          { role: 'user', content: question },
          { role: 'assistant', content: data.answer, sources: data.sources },
        ]);
        return data;
      } catch (err) {
        setError(getErrorMessage(err));
        setInput(question);
        throw err;
      } finally {
        setPending('');
        setBusy(false);
      }
    },
    [router, voiceMode],
  );

  const voice = useVoiceSession({
    language,
    active: voiceMode,
    onAsk: postQuestion,
  });

  function changeLanguage(code: string) {
    setLanguage(code);
    saveSpeechLanguage(code);
  }

  async function sendTyped(question: string) {
    if (busy || !question.trim()) return;
    setInput('');
    setError('');
    voice.setError('');
    if (voiceMode) {
      voice.unlock();
      await voice.ask(question);
      return;
    }
    try {
      await postQuestion(question.trim());
    } catch {
      // Error text is already shown.
    }
  }

  const selected = SPEECH_LANGUAGES.find((item) => item.code === language);

  return (
    <section
      aria-labelledby="help-chat-title"
      className="rounded-2xl border border-indigo-100 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="help-chat-title" className="text-lg font-semibold">
            Help chatbot
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Ask how Finlytix works. Speak or type; answers can be read aloud in your chosen Indian
            language.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={voiceMode}
            onChange={(event) => setVoiceMode(event.target.checked)}
          />
          Voice mode
        </label>
      </div>
      <div className="mt-4">
        <SpeechLanguageSelect
          value={language}
          onChange={changeLanguage}
          options={options}
          disabled={voice.status !== 'ready' && voiceMode}
          selectClassName="rounded-lg border border-slate-200 bg-white p-2"
        />
        {selected?.stt === 'limited' || selected?.tts === 'limited' ? (
          <p role="status" className="mt-2 text-xs text-amber-800">
            {selected.label} speech support varies by browser and installed voices. If recognition
            or playback is unavailable, the answer still appears as text.
          </p>
        ) : null}
      </div>
      {!signedIn && (
        <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <Link href="/auth" className="font-semibold text-indigo-700 underline">
            Sign in
          </Link>{' '}
          to ask the help chatbot. The FAQs below stay available without an account.
        </p>
      )}
      <div className="mt-4 max-h-80 space-y-3 overflow-y-auto">
        {messages.length === 0 && !pending && (
          <p className="text-sm text-slate-500">
            Try “How do I delete a statement?” or speak the same question in your selected language.
          </p>
        )}
        {messages.map((message, index) => (
          <article
            key={index}
            className={
              message.role === 'user'
                ? 'rounded-xl bg-indigo-50 p-3 text-sm'
                : 'rounded-xl border border-slate-200 p-3 text-sm'
            }
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {message.role === 'user' ? 'You' : 'Finlytix help'}
            </p>
            <p className="mt-1 whitespace-pre-wrap leading-6">{message.content}</p>
            {message.role === 'assistant' && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {message.sources?.map((source) => (
                  <Link
                    key={source.id}
                    href={source.href}
                    className="text-xs font-medium text-indigo-700 underline"
                  >
                    {source.label}
                  </Link>
                ))}
                <button
                  type="button"
                  disabled={voice.status === 'thinking'}
                  onClick={() => {
                    voice.unlock();
                    voice.setError('');
                    voice.speak(message.content);
                  }}
                  className="text-xs font-medium text-indigo-700 underline disabled:opacity-40"
                >
                  Read aloud
                </button>
              </div>
            )}
          </article>
        ))}
        {pending && (
          <p role="status" className="text-sm text-indigo-700">
            Checking the product guide…
          </p>
        )}
        <div ref={bottom} />
      </div>
      {voiceMode && (
        <div className="mt-4 rounded-xl bg-indigo-50 p-4">
          <p role="status" className="text-sm font-medium text-indigo-900">
            {voice.status === 'listening'
              ? 'Listening… finish your question to send it.'
              : voice.status === 'thinking'
                ? 'Checking the product guide…'
                : voice.status === 'speaking'
                  ? 'Finlytix is speaking…'
                  : 'Voice mode on — tap Speak or type below.'}
          </p>
          {voice.heard && <p className="mt-2 text-sm text-indigo-800">{voice.heard}</p>}
          {!voice.supported && (
            <p role="status" className="mt-2 text-sm text-amber-800">
              Speech recognition is unavailable here. Type your question, or use a browser with
              speech recognition enabled.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!signedIn || !voice.supported || voice.status === 'thinking' || busy}
              onClick={voice.toggleListen}
              className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {voice.status === 'listening'
                ? 'Finish question'
                : voice.status === 'speaking'
                  ? 'Interrupt & speak'
                  : 'Speak'}
            </button>
            <button
              type="button"
              onClick={voice.pause}
              className="rounded-lg border border-indigo-200 px-3 py-2 text-sm"
            >
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
        </div>
      )}
      {voice.notice && (
        <p role="status" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {voice.notice}
        </p>
      )}
      {(error || voice.error) && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error || voice.error}
        </p>
      )}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void sendTyped(input);
        }}
      >
        <input
          aria-label="Help question"
          value={input}
          maxLength={2000}
          disabled={
            !signedIn || busy || voice.status === 'listening' || voice.status === 'thinking'
          }
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask a product question…"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 p-3 text-sm"
        />
        <button
          disabled={
            !signedIn ||
            busy ||
            !input.trim() ||
            voice.status === 'listening' ||
            voice.status === 'thinking'
          }
          className="rounded-lg bg-indigo-700 px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? 'Working…' : 'Ask'}
        </button>
      </form>
      <p className="mt-3 text-xs text-slate-500">
        Help answers use your text or voice AI connection and the product guide. Finlytix does not
        store microphone recordings. Browser speech services may process audio.
      </p>
    </section>
  );
}
