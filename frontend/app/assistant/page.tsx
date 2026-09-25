'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import BackButton from '@/components/BackButton';
import { apiFetch, getErrorMessage } from '@/lib/api';
import { getAiProviderHeaders } from '@/lib/aiProvider';
import { formatDateTime, useUserPreferences } from '@/lib/date';
import { useTranslation } from '@/lib/translations';
import VoiceAssistantModal from '@/components/VoiceAssistantModal';
interface Evidence {
  income: string;
  expenses: string;
  net_cash_flow: string;
  transaction_count: string;
  first_date: string | null;
  last_date: string | null;
  filters: Record<string, string>;
}
interface Answer {
  answer: string;
  sources: { id: string; label: string; href: string }[];
  evidence: Evidence[];
  asOf: string;
}
interface Message {
  role: 'user' | 'assistant';
  content: string;
  result?: Answer;
  created_at?: string;
}

interface Conversation {
  id: string;
  title: string;
  updated_at: string;
}
const chatApi = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chat`;
const examples = [
  'Summarize my finances across all uploaded statements.',
  'Which statements have I uploaded?',
  'Compare my spending by category.',
  'How do I delete a statement?',
];
function FormattedText({ text }: { text: string }) {
  const paragraphs = text.split('\n\n');

  const renderInline = (str: string) => {
    const parts: (string | React.ReactNode)[] = [];
    const regex = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        parts.push(str.substring(lastIndex, match.index));
      }
      if (match[2] && match[3]) {
        let href = match[3].trim();
        if (href === '/profile') href = '/settings?tab=profile';
        if (href === '/preferences') href = '/settings?tab=preferences';
        const isExternal = href.startsWith('http://') || href.startsWith('https://');
        parts.push(
          <Link
            key={match.index}
            href={href}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noopener noreferrer' : undefined}
            className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 underline hover:text-indigo-800 transition-colors cursor-pointer"
          >
            {match[2]}
          </Link>,
        );
      } else if (match[4]) {
        parts.push(
          <strong key={match.index} className="font-semibold text-slate-900">
            {match[4]}
          </strong>,
        );
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < str.length) {
      parts.push(str.substring(lastIndex));
    }
    return parts.length > 0 ? parts : str;
  };

  return (
    <div className="space-y-2 text-sm leading-7">
      {paragraphs.map((p, idx) => (
        <p key={idx} className="whitespace-pre-wrap">
          {renderInline(p)}
        </p>
      ))}
    </div>
  );
}

export default function AssistantPage() {
  const router = useRouter();
  const prefs = useUserPreferences();
  const { t } = useTranslation();
  const money = (value: string | number) => prefs.formatMoney(value);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const loadGeneration = useRef(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [before, setBefore] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const historyStart = useRef<HTMLDivElement>(null);
  const scrollTarget = useRef<'latest' | 'older' | null>(null);
  useEffect(() => {
    const target = scrollTarget.current;
    scrollTarget.current = null;
    if (target === 'latest') bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    if (target === 'older')
      historyStart.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [messages, pendingQuestion]);
  async function loadHistory(older = false, id = selected) {
    const generation = ++loadGeneration.current;
    if (!id) {
      setMessages([]);
      setBefore(null);
      setLoadingHistory(false);
      return;
    }
    setLoadingHistory(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await apiFetch(
        `${chatApi}/history?conversationId=${encodeURIComponent(id)}${older && before ? '&before=' + before : ''}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (response.status === 401) {
        router.replace('/auth');
        return;
      }
      if (!response.ok) throw new Error('Unable to load saved history. Please retry.');
      const data = await response.json();
      if (generation !== loadGeneration.current) return;
      scrollTarget.current = older ? 'older' : 'latest';
      setMessages((previous) => (older ? [...data.messages, ...previous] : data.messages));
      setBefore(data.before);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      if (generation === loadGeneration.current) setLoadingHistory(false);
    }
  }
  async function refreshConversations() {
    const response = await apiFetch(`${chatApi}/conversations`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!response.ok) throw new Error('Unable to load conversations. Please refresh.');
    const data = await response.json();
    setConversations(data.conversations);
    return data.conversations as Conversation[];
  }
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void refreshConversations()
        .then((items) => {
          if (!active) return;
          const id = items[0]?.id || null;
          setSelected(id);
          void loadHistory(false, id);
        })
        .catch((err) => {
          if (active) {
            setError(getErrorMessage(err));
            setLoadingHistory(false);
          }
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function selectChat(id: string | null) {
    if (busy || isVoiceModalOpen) return;
    setSelected(id);
    setMessages([]);
    setBefore(null);
    setInput('');
    setError('');
    void loadHistory(false, id);
  }
  async function deleteChat(id: string) {
    if (
      busy ||
      isVoiceModalOpen ||
      !window.confirm('Delete this conversation and all its messages permanently?')
    )
      return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(`${chatApi}/conversations/${id}`, {
        method: 'DELETE',
        retries: 0,
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!response.ok) throw new Error('Unable to delete this conversation. Please retry.');
      const items = await refreshConversations();
      if (selected === id) {
        const next = items[0]?.id || null;
        setSelected(next);
        setMessages([]);
        setInput('');
        setBefore(null);
        await loadHistory(false, next);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function send(question = input, voice = false): Promise<Answer | undefined> {
    if (busy || loadingHistory || !question.trim()) return;
    const token = localStorage.getItem('token');
    if (!token) {
      router.replace('/auth');
      return;
    }
    setBusy(true);
    setError('');
    setInput('');
    const history = messages.slice(-6).map(({ role, content }) => ({ role, content }));
    scrollTarget.current = 'latest';
    setPendingQuestion(question);
    try {
      let conversationId = selected;
      if (!conversationId) {
        const created = await apiFetch(`${chatApi}/conversations`, {
          method: 'POST',
          retries: 0,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: question.trim().slice(0, 80) }),
        });
        if (!created.ok) throw new Error('Unable to start a new conversation.');
        const chat = await created.json();
        conversationId = chat.id;
        setSelected(chat.id);
        setConversations((previous) => [chat, ...previous]);
      }
      const response = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chat`,
        {
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
            conversationId,
            history,
            useCase: voice ? 'voice_chat' : 'text_chat',
          }),
        },
      );
      if (response.status === 401) {
        router.replace('/auth');
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to answer');
      const nowIso = new Date().toISOString();
      scrollTarget.current = 'latest';
      setMessages((previous) => [
        ...previous,
        { role: 'user', content: question, created_at: nowIso },
        { role: 'assistant', content: data.answer, result: data, created_at: data.asOf || nowIso },
      ]);
      void refreshConversations().catch(() => {});
      return data;
    } catch (err) {
      setError(getErrorMessage(err));
      setInput(question);
      if (voice) throw err;
    } finally {
      setPendingQuestion('');
      setBusy(false);
    }
  }
  return (
    <main className="h-dvh overflow-hidden bg-slate-50 text-slate-900 flex flex-col">
      <AuthSessionGuard />
      <header className="z-20 shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <BackButton fallbackHref="/dashboard" />
            <div className="min-w-0 border-l border-slate-200 pl-4">
              <h1 className="text-lg font-semibold tracking-tight">
                {t('assistantTitle', 'Ask Finlytix')}
              </h1>
              <p className="hidden text-xs text-slate-500 sm:block">
                Your finances, one conversation at a time.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/help"
              className="hidden text-xs text-slate-500 hover:text-indigo-700 sm:block"
            >
              Help & privacy
            </Link>
            <button
              type="button"
              onClick={() => setIsVoiceModalOpen(true)}
              disabled={busy || loadingHistory}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Talk to Finlytix
            </button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col md:flex-row">
        <aside
          aria-label="Saved conversations"
          className="shrink-0 border-b border-slate-200 bg-white p-3 md:w-64 md:overflow-y-auto md:border-b-0 md:border-r md:p-4"
        >
          <button
            type="button"
            onClick={() => selectChat(null)}
            disabled={busy || isVoiceModalOpen}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            + New chat
          </button>
          <p className="mb-2 mt-4 hidden text-[10px] font-semibold uppercase tracking-widest text-slate-400 md:block">
            Your conversations
          </p>
          <div className="mt-2 flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
            {conversations.map((chat) => (
              <div
                key={chat.id}
                className={`flex shrink-0 items-center gap-1 rounded-xl border md:shrink ${selected === chat.id ? 'border-indigo-200 bg-indigo-50' : 'border-transparent hover:bg-slate-50'}`}
              >
                <button
                  type="button"
                  disabled={busy || isVoiceModalOpen}
                  onClick={() => selectChat(chat.id)}
                  aria-current={selected === chat.id ? 'page' : undefined}
                  className="min-w-0 flex-1 px-3 py-3 text-left text-sm disabled:opacity-50"
                >
                  <span className="block max-w-44 truncate font-medium">{chat.title}</span>
                  <span className="mt-1 hidden text-[10px] text-slate-400 md:block">
                    Saved conversation
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete conversation: ${chat.title}`}
                  title="Delete conversation"
                  disabled={busy || isVoiceModalOpen}
                  onClick={() => void deleteChat(chat.id)}
                  className="mr-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    className="h-4 w-4"
                  >
                    <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-8">
            <div className="mx-auto max-w-3xl">
              <div className="my-4 flex flex-wrap gap-4 text-sm">
                <button
                  disabled={busy || loadingHistory}
                  onClick={() => void loadHistory()}
                  className="text-indigo-700 disabled:opacity-50"
                >
                  Refresh saved history
                </button>
                {before && (
                  <button
                    disabled={busy || loadingHistory}
                    onClick={() => void loadHistory(true)}
                    className="text-indigo-700 disabled:opacity-50"
                  >
                    Load older messages
                  </button>
                )}
                {loadingHistory && <span role="status">Loading history…</span>}
              </div>
              {messages.length === 0 && !loadingHistory && !pendingQuestion && (
                <div className="pt-8 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-2xl text-indigo-700">
                    ✦
                  </div>
                  <h2 className="text-2xl font-semibold tracking-tight">
                    What would you like to explore?
                  </h2>
                  <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">
                    Start a focused conversation about your spending, statements, or Finlytix. Each
                    chat keeps its own history.
                  </p>
                </div>
              )}
              {messages.length === 0 && !loadingHistory && !pendingQuestion && (
                <div className="my-8 grid gap-3 sm:grid-cols-2">
                  {examples.map((question) => (
                    <button
                      key={question}
                      onClick={() => void send(question)}
                      disabled={busy || loadingHistory}
                      className="rounded-xl border border-indigo-100 bg-white p-4 text-left text-sm hover:border-indigo-400"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              )}
              <section aria-label="Conversation" aria-live="polite" className="my-6 space-y-5">
                <div ref={historyStart} />
                {messages.map((message, index) => (
                  <article
                    key={index}
                    className={
                      message.role === 'user'
                        ? 'ml-8 rounded-2xl bg-indigo-100 p-5'
                        : 'mr-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm'
                    }
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <span>{message.role === 'user' ? 'You' : 'Finlytix'}</span>
                      {(message.created_at || message.result?.asOf) && (
                        <time
                          dateTime={message.created_at || message.result?.asOf}
                          className="text-[11px] font-medium normal-case tracking-normal text-slate-400"
                        >
                          {formatDateTime(
                            message.created_at || message.result?.asOf,
                            prefs.dateFormat,
                            prefs.timeFormat,
                            prefs.timezone,
                          )}
                        </time>
                      )}
                    </div>
                    {message.role === 'assistant' ? (
                      <FormattedText text={message.content} />
                    ) : (
                      <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
                    )}
                    {message.result?.evidence.map((item, i) => (
                      <div key={i} className="mt-4 rounded-xl bg-slate-50 p-4 text-sm">
                        <p className="font-semibold">
                          Database totals · {item.transaction_count} matching transactions
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {item.first_date || 'No transactions'}
                          {item.last_date ? ' to ' + item.last_date : ''} ·{' '}
                          {Object.entries(item.filters)
                            .map(([k, v]) => k + ': ' + v)
                            .join(', ') || 'All uploaded data'}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-5">
                          <span>Income {money(item.income)}</span>
                          <span>Expenses {money(item.expenses)}</span>
                          <span>Net cash flow {money(item.net_cash_flow)}</span>
                        </div>
                      </div>
                    ))}
                    {Boolean(message.result?.sources?.length) && (
                      <div className="mt-4 border-t border-slate-100 pt-3">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Referenced Records:
                        </p>
                        <nav aria-label="Supporting records" className="flex flex-wrap gap-2">
                          {message.result?.sources.map((source) => (
                            <Link
                              key={source.id}
                              href={
                                source.href === '/profile' ? '/settings?tab=profile' : source.href
                              }
                              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-3 py-1.5 text-xs font-medium text-indigo-700 shadow-2xs transition-all hover:bg-indigo-100 hover:text-indigo-900 hover:shadow-xs active:scale-95 cursor-pointer"
                            >
                              <svg
                                className="h-3.5 w-3.5 opacity-75"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                />
                              </svg>
                              {source.label}
                            </Link>
                          ))}
                        </nav>
                      </div>
                    )}
                    {message.result && (
                      <p className="mt-3 text-xs text-slate-400">
                        Based on data retrieved at{' '}
                        {formatDateTime(
                          message.result.asOf,
                          prefs.dateFormat,
                          prefs.timeFormat,
                          prefs.timezone,
                        )}
                        . Later imports or deletions may change these results.
                      </p>
                    )}
                  </article>
                ))}
                {pendingQuestion && (
                  <article className="ml-8 rounded-2xl bg-indigo-100 p-5">
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-wide text-slate-500">
                      <span>You · sending</span>
                      <span className="text-[11px] font-medium normal-case tracking-normal text-slate-400">
                        {formatDateTime(
                          new Date(),
                          prefs.dateFormat,
                          prefs.timeFormat,
                          prefs.timezone,
                        )}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-7">{pendingQuestion}</p>
                  </article>
                )}
                {pendingQuestion && (
                  <p role="status" className="rounded-xl bg-white p-4 text-sm text-indigo-700">
                    Checking your records and preparing an answer…
                  </p>
                )}
                <div ref={bottom} />
              </section>
              {error && (
                <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </p>
              )}
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
            className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 sm:px-8"
          >
            <label htmlFor="question" className="sr-only">
              Your question
            </label>
            <textarea
              id="question"
              value={input}
              maxLength={2000}
              onChange={(event) => setInput(event.target.value)}
              placeholder={t('askPlaceholder', 'Ask about your finances or how Finlytix works…')}
              rows={2}
              disabled={busy || loadingHistory}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (!busy && !loadingHistory && input.trim()) {
                    void send();
                  }
                }
              }}
              className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm focus:outline-indigo-500"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {selected ? 'Saved to your account' : 'New conversation'}
              </span>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-xs text-slate-400">
                  {t('pressEnterTip', 'Press Enter to submit • Shift + Enter for newline')}
                </span>
                <button
                  type="button"
                  onClick={() => setIsVoiceModalOpen(true)}
                  disabled={busy || loadingHistory}
                  title="Start Voice Assistant"
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 text-slate-700 hover:text-indigo-600 transition cursor-pointer flex items-center justify-center"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  </svg>
                </button>
                <button
                  disabled={busy || loadingHistory || !input.trim()}
                  className="rounded-xl bg-indigo-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50 cursor-pointer transition hover:bg-indigo-800"
                >
                  {busy ? t('loading', 'Working…') : t('askButton', 'Send question')}
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Relevant financial records are sent to your selected AI provider. Verify important
              figures against the supporting records.
            </p>
          </form>
        </div>
      </div>
      {isVoiceModalOpen && (
        <VoiceAssistantModal
          locale={prefs.locale}
          onAsk={(question) => send(question, true)}
          onClose={() => setIsVoiceModalOpen(false)}
        />
      )}
    </main>
  );
}
