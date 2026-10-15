'use client';

import { useEffect, useRef, useState, Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import BackButton from '@/components/BackButton';
import { apiFetch, getErrorMessage } from '@/lib/api';
import { getAiProviderHeaders } from '@/lib/aiProvider';
import { formatDateTime, useUserPreferences } from '@/lib/date';
import { useTranslation } from '@/lib/translations';
import VoiceAssistantModal from '@/components/VoiceAssistantModal';

/* ──────────────────────────────────────────────────────────────
   Types
   ────────────────────────────────────────────────────────────── */

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

/* ──────────────────────────────────────────────────────────────
   Constants & helpers
   ────────────────────────────────────────────────────────────── */

const chatApi = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/chat`;

const examples = [
  { q: 'Summarize my finances across all uploaded statements.', icon: '📊' },
  { q: 'Which statements have I uploaded?', icon: '📄' },
  { q: 'Compare my spending by category.', icon: '📈' },
  { q: 'How do I delete a statement?', icon: '❓' },
];

/** Relative time for sidebar chats */
function relativeTime(iso: string | undefined): string {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/* ──────────────────────────────────────────────────────────────
   Motion variants
   ────────────────────────────────────────────────────────────── */

const msgVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 320, damping: 28 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
};

const sidebarItem = {
  hidden: { opacity: 0, x: -12 },
  show: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 26 } },
};

/* ──────────────────────────────────────────────────────────────
   SVG Icons
   ────────────────────────────────────────────────────────────── */

function SparkleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  );
}
function SendIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
      />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
      />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
function TrashSmallIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="h-3.5 w-3.5"
    >
      <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    </svg>
  );
}
function ChatBubbleIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-12.375 0c0 4.556 3.694 8.25 8.25 8.25 1.593 0 3.081-.451 4.342-1.233l3.408.678-.678-3.408A8.21 8.21 0 0020.25 12c0-4.556-3.694-8.25-8.25-8.25S3.75 7.444 3.75 12z"
      />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
      />
    </svg>
  );
}
function ChevronUpIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
  );
}
function ExternalLinkIcon() {
  return (
    <svg className="h-3.5 w-3.5 opacity-75" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────
   FormattedText — Markdown‑lite renderer
   ────────────────────────────────────────────────────────────── */

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
    <div className="space-y-2.5 text-[14px] leading-7 text-slate-800">
      {paragraphs.map((p, idx) => (
        <p key={idx} className="whitespace-pre-wrap">
          {renderInline(p)}
        </p>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Skeleton Components
   ────────────────────────────────────────────────────────────── */

function ChatSkeleton() {
  return (
    <div className="flex flex-col gap-6 py-8 px-2">
      {/* User question on the left */}
      <div className="flex justify-start">
        <div className="flex items-end gap-2.5 max-w-[75%]">
          <div className="shrink-0 w-8 h-8 rounded-full bg-indigo-200 animate-pulse" />
          <div className="animate-pulse rounded-2xl rounded-tl-sm bg-indigo-100 p-4 space-y-2 w-64">
            <div className="h-3.5 bg-indigo-200/60 rounded-full w-4/5" />
            <div className="h-3.5 bg-indigo-200/60 rounded-full w-3/5" />
          </div>
        </div>
      </div>
      {/* AI answer slightly offset to the right */}
      <div className="flex justify-start ml-6 sm:ml-10">
        <div className="flex items-end gap-2.5 max-w-[85%]">
          <div className="shrink-0 w-8 h-8 rounded-full bg-slate-200 animate-pulse" />
          <div className="animate-pulse rounded-2xl rounded-tl-sm bg-white border border-slate-200 p-5 space-y-2.5 w-96">
            <div className="h-3 bg-slate-200 rounded-full w-full" />
            <div className="h-3 bg-slate-200 rounded-full w-5/6" />
            <div className="h-3 bg-slate-200 rounded-full w-4/5" />
            <div className="h-3 bg-slate-200 rounded-full w-2/3" />
          </div>
        </div>
      </div>
      {/* Second user question on the left */}
      <div className="flex justify-start">
        <div className="flex items-end gap-2.5 max-w-[75%]">
          <div className="shrink-0 w-8 h-8 rounded-full bg-indigo-200 animate-pulse" />
          <div className="animate-pulse rounded-2xl rounded-tl-sm bg-indigo-100 p-4 space-y-2 w-52">
            <div className="h-3.5 bg-indigo-200/60 rounded-full w-full" />
            <div className="h-3.5 bg-indigo-200/60 rounded-full w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Animated typing indicator for assistant thinking state */
function TypingIndicator() {
  return (
    <div className="flex justify-start ml-6 sm:ml-10">
      <div className="flex items-end gap-2.5">
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
          <SparkleIcon className="w-4 h-4 text-white" />
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl rounded-tl-sm bg-white border border-slate-200 px-5 py-4 shadow-sm"
        >
          <div className="flex items-center gap-1.5">
            <motion.span
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: 0 }}
              className="w-2 h-2 bg-indigo-500 rounded-full"
            />
            <motion.span
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }}
              className="w-2 h-2 bg-indigo-500 rounded-full"
            />
            <motion.span
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }}
              className="w-2 h-2 bg-indigo-500 rounded-full"
            />
            <span className="ml-2 text-xs text-slate-400 font-medium">
              Analyzing your financial records…
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Main Page Component
   ────────────────────────────────────────────────────────────── */

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
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Custom Delete Confirmation Modal state
  const [chatToDelete, setChatToDelete] = useState<{ id: string; title: string } | null>(null);

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
    setSidebarOpen(false);
    void loadHistory(false, id);
  }

  async function executeDeleteChat(id: string) {
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
      setChatToDelete(null);
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
    <main className="h-full flex flex-col">
      <AuthSessionGuard />

      {/* ═══════════════════════════════════════════════════════════════
          Header
          ═══════════════════════════════════════════════════════════════ */}
      <header className="z-20 shrink-0 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <BackButton fallbackHref="/dashboard" />
            <div className="min-w-0 border-l border-slate-200 pl-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-md shadow-indigo-100">
                  <SparkleIcon className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-base font-bold tracking-tight text-slate-900">
                    {t('assistantTitle', 'Ask Finlytix')}
                  </h1>
                  <p className="hidden text-[11px] text-slate-500 sm:block">
                    Your finances, one conversation at a time
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/help"
              className="hidden text-xs font-medium text-slate-500 hover:text-indigo-700 sm:block transition-colors"
            >
              Help & privacy
            </Link>
            {/* Mobile sidebar toggle */}
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="md:hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 transition cursor-pointer"
              aria-label="Toggle conversations"
            >
              <ChatBubbleIcon />
            </button>
            <button
              type="button"
              onClick={() => setIsVoiceModalOpen(true)}
              disabled={busy || loadingHistory}
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 transition-all shadow-sm hover:shadow cursor-pointer flex items-center gap-1.5"
            >
              <MicIcon />
              <span className="hidden sm:inline">Talk to Finlytix</span>
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════
          Body: Sidebar + Chat
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col md:flex-row">
        {/* ── Sidebar ── */}
        <AnimatePresence>
          {(sidebarOpen || true) && (
            <motion.aside
              aria-label="Saved conversations"
              className={`shrink-0 border-b border-slate-200/80 bg-gradient-to-b from-slate-50 to-white p-3 md:w-64 md:overflow-y-auto md:border-b-0 md:border-r md:p-4 ${
                sidebarOpen ? 'block' : 'hidden md:block'
              }`}
            >
              {/* New chat button */}
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => selectChat(null)}
                disabled={busy || isVoiceModalOpen}
                className="w-full rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 px-4 py-3 text-sm font-semibold text-white hover:from-slate-700 hover:to-slate-800 disabled:opacity-50 transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2"
              >
                <PlusIcon />
                New chat
              </motion.button>

              <p className="mb-2 mt-5 hidden text-[10px] font-bold uppercase tracking-widest text-slate-400 md:block">
                Conversations
              </p>

              <div className="mt-2 flex gap-2 overflow-x-auto md:flex-col md:overflow-visible md:space-y-0.5">
                {conversations.length === 0 && !loadingHistory && (
                  <p className="hidden md:block text-xs text-slate-400 px-3 py-2">
                    No conversations yet
                  </p>
                )}
                <AnimatePresence>
                  {conversations.map((chat) => (
                    <motion.div
                      key={chat.id}
                      variants={sidebarItem}
                      initial="hidden"
                      animate="show"
                      exit={{ opacity: 0, x: -12 }}
                      layout
                      className={`group flex shrink-0 items-center gap-1 rounded-xl md:shrink transition-all ${
                        selected === chat.id
                          ? 'bg-indigo-50 border border-indigo-200 shadow-sm'
                          : 'border border-transparent hover:bg-slate-50 hover:border-slate-200/60'
                      }`}
                    >
                      <button
                        type="button"
                        disabled={busy || isVoiceModalOpen}
                        onClick={() => selectChat(chat.id)}
                        aria-current={selected === chat.id ? 'page' : undefined}
                        className="min-w-0 flex-1 px-3 py-2.5 text-left disabled:opacity-50 cursor-pointer"
                      >
                        <span className="block max-w-44 truncate text-sm font-medium text-slate-800">
                          {chat.title}
                        </span>
                        <span className="mt-0.5 hidden text-[10px] text-slate-400 md:block">
                          {relativeTime(chat.updated_at)}
                        </span>
                      </button>
                      {/* Delete button triggering Custom Confirmation Dialog */}
                      <button
                        type="button"
                        aria-label={`Delete conversation: ${chat.title}`}
                        title="Delete conversation"
                        disabled={busy || isVoiceModalOpen}
                        onClick={() => setChatToDelete(chat)}
                        className="mr-1.5 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                      >
                        <TrashSmallIcon />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ── Chat Area ── */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-gradient-to-b from-slate-50/50 to-white">
          {/* Scrollable message area */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-8">
            <div className="mx-auto max-w-3xl">
              {/* Load older / refresh controls */}
              {!loadingHistory && messages.length > 0 && (
                <div className="my-4 flex flex-wrap items-center justify-center gap-3">
                  {before && (
                    <button
                      disabled={busy || loadingHistory}
                      onClick={() => void loadHistory(true)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 cursor-pointer bg-indigo-50 hover:bg-indigo-100 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      <ChevronUpIcon />
                      Load older messages
                    </button>
                  )}
                  <button
                    disabled={busy || loadingHistory}
                    onClick={() => void loadHistory()}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50 cursor-pointer hover:bg-slate-100 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    <RefreshIcon />
                    Refresh
                  </button>
                </div>
              )}

              {/* ── Full‑page Loading Skeleton ── */}
              {loadingHistory && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ChatSkeleton />
                </motion.div>
              )}

              {/* ── Empty State (Welcome) ── */}
              {messages.length === 0 && !loadingHistory && !pendingQuestion && (
                <motion.div
                  variants={fadeUp}
                  initial="hidden"
                  animate="show"
                  className="pt-12 sm:pt-20 text-center"
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{
                      type: 'spring' as const,
                      stiffness: 300,
                      damping: 20,
                      delay: 0.1,
                    }}
                    className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-200"
                  >
                    <SparkleIcon className="w-8 h-8 text-white" />
                  </motion.div>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                    What would you like to explore?
                  </h2>
                  <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">
                    Start a focused conversation about your spending, statements, or Finlytix. Each
                    chat keeps its own history so you can revisit anytime.
                  </p>

                  {/* Example prompts */}
                  <motion.div
                    initial="hidden"
                    animate="show"
                    variants={{
                      show: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } },
                    }}
                    className="my-8 grid gap-3 sm:grid-cols-2"
                  >
                    {examples.map(({ q, icon }) => (
                      <motion.button
                        key={q}
                        variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}
                        whileHover={{ scale: 1.02, y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => void send(q)}
                        disabled={busy || loadingHistory}
                        className="group rounded-2xl border border-slate-200 bg-white p-4 text-left text-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer disabled:opacity-50"
                      >
                        <span className="text-lg mb-2 block">{icon}</span>
                        <span className="text-slate-700 group-hover:text-indigo-700 transition-colors font-medium">
                          {q}
                        </span>
                      </motion.button>
                    ))}
                  </motion.div>
                </motion.div>
              )}

              {/* ═══════════════════════════════════════════════════════
                  Messages
                  Requirement: User text at left, AI answers come a bit right.
                  User bubble: No "You", no date/time header.
                  AI bubble: Footer has full date, year AND time.
                  ═══════════════════════════════════════════════════════ */}
              <section aria-label="Conversation" aria-live="polite" className="my-6 space-y-4">
                <div ref={historyStart} />
                <AnimatePresence>
                  {messages.map((message, index) => {
                    const isUser = message.role === 'user';

                    if (isUser) {
                      // ── User Question: Left-aligned, no "You", no date/time header ──
                      return (
                        <motion.div
                          key={index}
                          variants={msgVariants}
                          initial="hidden"
                          animate="show"
                          className="flex justify-start"
                        >
                          <div className="flex items-end gap-2.5 max-w-[85%] sm:max-w-[75%]">
                            <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-sm">
                              <svg
                                className="w-4 h-4 text-white"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                                />
                              </svg>
                            </div>
                            <div className="rounded-2xl rounded-tl-sm bg-gradient-to-br from-indigo-600 via-indigo-600 to-blue-600 text-white p-4 sm:p-5 shadow-sm">
                              <p className="whitespace-pre-wrap text-sm leading-7 font-normal">
                                {message.content}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      );
                    }

                    // ── AI Answer: Slightly offset to the right, full date/year/time in footer ──
                    const asOfTimestamp = message.result?.asOf || message.created_at;

                    return (
                      <motion.div
                        key={index}
                        variants={msgVariants}
                        initial="hidden"
                        animate="show"
                        className="flex justify-start ml-6 sm:ml-10"
                      >
                        <div className="flex items-end gap-2.5 max-w-[90%] sm:max-w-[85%]">
                          {/* Bot Avatar */}
                          <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm">
                            <SparkleIcon className="w-4 h-4 text-white" />
                          </div>

                          {/* AI Response Card */}
                          <div className="rounded-2xl rounded-tl-sm border border-slate-200/90 bg-white p-4 sm:p-5 shadow-sm">
                            {/* Header badge */}
                            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
                              <span>Finlytix</span>
                            </div>

                            {/* Message text */}
                            <FormattedText text={message.content} />

                            {/* Evidence cards */}
                            {message.result?.evidence.map((item, i) => (
                              <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 * i }}
                                className="mt-4 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100/60 border border-slate-200/80 p-4 text-sm"
                              >
                                <p className="font-semibold text-slate-800 flex items-center gap-1.5">
                                  <span className="inline-flex w-5 h-5 items-center justify-center rounded-md bg-indigo-100 text-indigo-600">
                                    <svg
                                      className="w-3 h-3"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth={2.5}
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5"
                                      />
                                    </svg>
                                  </span>
                                  {item.transaction_count} matching transactions
                                </p>
                                <p className="mt-1 text-xs text-slate-500">
                                  {item.first_date || 'No transactions'}
                                  {item.last_date ? ' to ' + item.last_date : ''} ·{' '}
                                  {Object.entries(item.filters)
                                    .map(([k, v]) => k + ': ' + v)
                                    .join(', ') || 'All uploaded data'}
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2.5">
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                    ↑ Income {money(item.income)}
                                  </span>
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 border border-rose-200/60 px-2.5 py-1 text-xs font-semibold text-rose-700">
                                    ↓ Expenses {money(item.expenses)}
                                  </span>
                                  <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 border border-blue-200/60 px-2.5 py-1 text-xs font-semibold text-blue-700">
                                    ≈ Net {money(item.net_cash_flow)}
                                  </span>
                                </div>
                              </motion.div>
                            ))}

                            {/* Source links */}
                            {Boolean(message.result?.sources?.length) && (
                              <div className="mt-4 border-t border-slate-100 pt-3">
                                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                  Referenced Records
                                </p>
                                <nav
                                  aria-label="Supporting records"
                                  className="flex flex-wrap gap-2"
                                >
                                  {message.result?.sources.map((source) => (
                                    <Link
                                      key={source.id}
                                      href={
                                        source.href === '/profile'
                                          ? '/settings?tab=profile'
                                          : source.href
                                      }
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-3 py-1.5 text-xs font-medium text-indigo-700 shadow-sm transition-all hover:bg-indigo-100 hover:text-indigo-900 hover:shadow active:scale-95 cursor-pointer"
                                    >
                                      <ExternalLinkIcon />
                                      {source.label}
                                    </Link>
                                  ))}
                                </nav>
                              </div>
                            )}

                            {/* Full Date, Year AND Time footer */}
                            {asOfTimestamp && (
                              <p className="mt-3 text-[11px] text-slate-400 flex items-center gap-1.5">
                                <svg
                                  className="w-3.5 h-3.5 shrink-0 text-slate-400"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                                Data as of{' '}
                                {formatDateTime(
                                  asOfTimestamp,
                                  prefs.dateFormat,
                                  prefs.timeFormat,
                                  prefs.timezone,
                                )}
                                . Later imports may change results.
                              </p>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {/* Pending question bubble (Left-aligned, clean) */}
                <AnimatePresence>
                  {pendingQuestion && (
                    <Fragment>
                      <motion.div
                        variants={msgVariants}
                        initial="hidden"
                        animate="show"
                        exit={{ opacity: 0 }}
                        className="flex justify-start"
                      >
                        <div className="flex items-end gap-2.5 max-w-[85%] sm:max-w-[75%]">
                          <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center shadow-sm">
                            <svg
                              className="w-4 h-4 text-white"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2}
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                              />
                            </svg>
                          </div>
                          <div className="rounded-2xl rounded-tl-sm bg-gradient-to-br from-indigo-600 via-indigo-600 to-blue-600 text-white p-4 sm:p-5 shadow-sm">
                            <p className="whitespace-pre-wrap text-sm leading-7">
                              {pendingQuestion}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                      {/* Typing indicator (Offset to the right) */}
                      <TypingIndicator />
                    </Fragment>
                  )}
                </AnimatePresence>

                <div ref={bottom} />
              </section>

              {/* Error banner */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    role="alert"
                    className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 flex items-center gap-2"
                  >
                    <span>⚠️</span>
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════
              Input Bar
              ═══════════════════════════════════════════════════════════ */}
          <div className="shrink-0 border-t border-slate-200/80 bg-white px-4 py-3 sm:px-8">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
              className="mx-auto max-w-3xl"
            >
              <div className="relative rounded-2xl border border-slate-200 bg-slate-50/80 focus-within:border-indigo-400 focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-100 transition-all shadow-sm">
                <label htmlFor="question" className="sr-only">
                  Your question
                </label>
                <textarea
                  id="question"
                  value={input}
                  maxLength={2000}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={t(
                    'askPlaceholder',
                    'Ask about your finances or how Finlytix works…',
                  )}
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
                  className="w-full resize-none rounded-2xl border-0 bg-transparent p-4 pr-28 text-sm focus:outline-none disabled:opacity-50 placeholder:text-slate-400"
                />

                {/* Action buttons inside the input container */}
                <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsVoiceModalOpen(true)}
                    disabled={busy || loadingHistory}
                    title="Start Live Voice Assistant"
                    className="p-2.5 rounded-xl text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition cursor-pointer disabled:opacity-40"
                  >
                    <MicIcon />
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="submit"
                    disabled={busy || loadingHistory || !input.trim()}
                    className="rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 p-2.5 text-white disabled:opacity-40 cursor-pointer transition-all shadow-sm hover:shadow-md"
                  >
                    {busy ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <SendIcon />
                    )}
                  </motion.button>
                </div>
              </div>

              {/* Footer info */}
              <div className="mt-2 flex items-center justify-between px-1">
                <span className="text-[11px] text-slate-400 flex items-center gap-1">
                  {selected ? (
                    <>
                      <svg
                        className="w-3 h-3 text-emerald-500"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Saved conversation
                    </>
                  ) : (
                    <>
                      <PlusIcon />
                      New conversation
                    </>
                  )}
                </span>
                <span className="hidden sm:inline text-[11px] text-slate-400">
                  {t('pressEnterTip', 'Enter to send · Shift+Enter for newline')}
                </span>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          Custom Delete Confirmation Dialog
          ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {chatToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 350, damping: 25 }}
              className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200"
              role="dialog"
              aria-modal="true"
              aria-labelledby="delete-dialog-title"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 id="delete-dialog-title" className="text-base font-bold text-slate-900">
                    Delete Conversation
                  </h3>
                  <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                    Are you sure you want to permanently delete{' '}
                    <strong className="text-slate-800 font-semibold">
                      &ldquo;{chatToDelete.title}&rdquo;
                    </strong>{' '}
                    and all its messages? This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setChatToDelete(null)}
                  disabled={busy}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => executeDeleteChat(chatToDelete.id)}
                  disabled={busy}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 transition cursor-pointer flex items-center gap-1.5"
                >
                  {busy ? 'Deleting…' : 'Delete Conversation'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════
          Interactive Real-time Voice Assistant Modal
          ═══════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isVoiceModalOpen && (
          <VoiceAssistantModal
            locale={prefs.locale}
            onAsk={(question) => send(question, true)}
            onClose={() => setIsVoiceModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </main>
  );
}
