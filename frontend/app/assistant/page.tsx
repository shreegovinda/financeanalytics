'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import BackButton from '@/components/BackButton';
import { apiFetch, getErrorMessage } from '@/lib/api';
import { getAiProviderHeaders } from '@/lib/aiProvider';
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
}

const examples = [
  'Summarize my finances across all uploaded statements.',
  'Which statements have I uploaded?',
  'Compare my spending by category.',
  'How do I delete a statement?',
];
const money = (value: string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value));
export default function AssistantPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [before, setBefore] = useState<string | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState('');
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
  async function loadHistory(older = false) {
    setLoadingHistory(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chat/history${older && before ? '?before=' + before : ''}`,
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
      scrollTarget.current = older ? 'older' : 'latest';
      setMessages((previous) => (older ? [...data.messages, ...previous] : data.messages));
      setBefore(data.before);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoadingHistory(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void loadHistory(), 0);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function deleteHistory() {
    if (
      busy ||
      loadingHistory ||
      !window.confirm('Permanently delete your saved assistant history?')
    )
      return;
    setBusy(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await apiFetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chat/history`,
        {
          method: 'DELETE',
          retries: 0,
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      if (!response.ok) throw new Error('Unable to delete saved history. Please retry.');
      setMessages([]);
      setBefore(null);
      setInput('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  async function send(question = input) {
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
          body: JSON.stringify({ message: question, history }),
        },
      );
      if (response.status === 401) {
        router.replace('/auth');
        return;
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to answer');
      scrollTarget.current = 'latest';
      setMessages((previous) => [
        ...previous,
        { role: 'user', content: question },
        { role: 'assistant', content: data.answer, result: data },
      ]);
    } catch (err) {
      setError(getErrorMessage(err));
      setInput(question);
    } finally {
      setPendingQuestion('');
      setBusy(false);
    }
  }
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900">
      <AuthSessionGuard />
      <div className="mx-auto max-w-4xl">
        <BackButton fallbackHref="/dashboard" className="mb-5" />
        <header className="rounded-2xl bg-gradient-to-br from-indigo-700 to-slate-900 p-6 text-white">
          <p className="text-sm text-indigo-200">Your data. Your questions.</p>
          <h1 className="mt-1 text-3xl font-bold">Ask Finlytix</h1>
          <p className="mt-3 text-sm text-indigo-100">
            Explore your statements, spending and product features. Relevant records are sent to
            your configured AI provider to answer. This assistant cannot change your data.
          </p>
        </header>
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
        {messages.length === 0 && !loadingHistory && (
          <div className="my-6 grid gap-3 sm:grid-cols-2">
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
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                {message.role === 'user' ? 'You' : 'Finlytix'}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
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
              {Boolean(message.result?.sources.length) && (
                <nav aria-label="Supporting records" className="mt-4 flex flex-wrap gap-2">
                  {message.result?.sources.map((source) => (
                    <Link
                      key={source.id}
                      href={source.href}
                      className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-50"
                    >
                      {source.label}
                    </Link>
                  ))}
                </nav>
              )}
              {message.result && (
                <p className="mt-3 text-xs text-slate-400">
                  Based on data retrieved at {new Date(message.result.asOf).toLocaleTimeString()}.
                  Later imports or deletions may change these results.
                </p>
              )}
            </article>
          ))}
          {pendingQuestion && (
            <article className="ml-8 rounded-2xl bg-indigo-100 p-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                You · sending
              </p>
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
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="sticky bottom-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg"
        >
          <label htmlFor="question" className="sr-only">
            Your question
          </label>
          <textarea
            id="question"
            value={input}
            maxLength={2000}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about your finances or how Finlytix works…"
            rows={3}
            disabled={busy || loadingHistory}
            className="w-full resize-none rounded-lg border border-slate-200 p-3 text-sm focus:outline-indigo-500"
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              disabled={busy || loadingHistory || messages.length === 0}
              onClick={() => void deleteHistory()}
              className="text-sm text-red-600 disabled:opacity-50"
            >
              Delete saved history
            </button>
            <button
              disabled={busy || loadingHistory || !input.trim()}
              className="rounded-xl bg-indigo-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50"
            >
              {busy ? 'Working…' : 'Send question'}
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            Your conversation is saved to your account. Verify important figures using the
            supporting records.
          </p>
        </form>
      </div>
    </main>
  );
}
