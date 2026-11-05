'use client';

import React, { useEffect, useState, useCallback, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import { activityLogAPI, ActivityLog, getErrorMessage } from '@/lib/api';
import { formatDateTime, useUserPreferences } from '@/lib/date';
import { useTranslation } from '@/lib/translations';

/* ──────────────────────────────────────────────────────────────
   Utility helpers
   ────────────────────────────────────────────────────────────── */

function formatFieldName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDiffVal(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof val === 'boolean') return val ? 'Enabled' : 'Disabled';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

/** Human‑friendly relative time, e.g. "2 min ago", "Yesterday" */
function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w ago`;
  return `${Math.floor(diffDay / 30)}mo ago`;
}

/** Group key for date headers: "Today", "Yesterday", or locale date */
function dateGroupLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const logDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today.getTime() - logDay.getTime()) / 86400000;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* ──────────────────────────────────────────────────────────────
   Action metadata: icon, color, human‑readable label
   ────────────────────────────────────────────────────────────── */

interface ActionMeta {
  icon: React.ReactNode;
  label: string;
  color: string; // Tailwind color token (e.g. "amber")
  dotColor: string; // Timeline dot bg class
  bgClass: string; // Badge bg
  textClass: string; // Badge text
  borderClass: string; // Badge border
}

function getActionMeta(action: string, category: string): ActionMeta {
  const map: Record<string, ActionMeta> = {
    PASSWORD_CHANGE: {
      icon: <KeyIcon />,
      label: 'Password Changed',
      color: 'amber',
      dotColor: 'bg-amber-500',
      bgClass: 'bg-amber-50',
      textClass: 'text-amber-700',
      borderClass: 'border-amber-200',
    },
    PASSWORD_RESET: {
      icon: <KeyIcon />,
      label: 'Password Reset',
      color: 'amber',
      dotColor: 'bg-amber-500',
      bgClass: 'bg-amber-50',
      textClass: 'text-amber-700',
      borderClass: 'border-amber-200',
    },
    LOGIN: {
      icon: <LockIcon />,
      label: 'Signed In',
      color: 'emerald',
      dotColor: 'bg-emerald-500',
      bgClass: 'bg-emerald-50',
      textClass: 'text-emerald-700',
      borderClass: 'border-emerald-200',
    },
    EMAIL_CHANGE: {
      icon: <MailIcon />,
      label: 'Email Updated',
      color: 'blue',
      dotColor: 'bg-blue-500',
      bgClass: 'bg-blue-50',
      textClass: 'text-blue-700',
      borderClass: 'border-blue-200',
    },
    PHONE_CHANGE: {
      icon: <PhoneIcon />,
      label: 'Phone Updated',
      color: 'indigo',
      dotColor: 'bg-indigo-500',
      bgClass: 'bg-indigo-50',
      textClass: 'text-indigo-700',
      borderClass: 'border-indigo-200',
    },
    NAME_CHANGE: {
      icon: <UserIcon />,
      label: 'Name Updated',
      color: 'sky',
      dotColor: 'bg-sky-500',
      bgClass: 'bg-sky-50',
      textClass: 'text-sky-700',
      borderClass: 'border-sky-200',
    },
    PREFERENCES_UPDATE: {
      icon: <GearIcon />,
      label: 'Preferences',
      color: 'purple',
      dotColor: 'bg-purple-500',
      bgClass: 'bg-purple-50',
      textClass: 'text-purple-700',
      borderClass: 'border-purple-200',
    },
    AI_SETTINGS_UPDATE: {
      icon: <BotIcon />,
      label: 'AI Settings',
      color: 'violet',
      dotColor: 'bg-violet-500',
      bgClass: 'bg-violet-50',
      textClass: 'text-violet-700',
      borderClass: 'border-violet-200',
    },
    STATEMENT_UPLOAD: {
      icon: <UploadIcon />,
      label: 'Statement Upload',
      color: 'teal',
      dotColor: 'bg-teal-500',
      bgClass: 'bg-teal-50',
      textClass: 'text-teal-700',
      borderClass: 'border-teal-200',
    },
    STATEMENT_CONFIRM: {
      icon: <CheckCircleIcon />,
      label: 'Statement Imported',
      color: 'green',
      dotColor: 'bg-green-500',
      bgClass: 'bg-green-50',
      textClass: 'text-green-700',
      borderClass: 'border-green-200',
    },
    STATEMENT_DELETE: {
      icon: <TrashIcon />,
      label: 'Statement Deleted',
      color: 'rose',
      dotColor: 'bg-rose-500',
      bgClass: 'bg-rose-50',
      textClass: 'text-rose-700',
      borderClass: 'border-rose-200',
    },
    DATA_EXPORT: {
      icon: <DownloadIcon />,
      label: 'Data Export',
      color: 'cyan',
      dotColor: 'bg-cyan-500',
      bgClass: 'bg-cyan-50',
      textClass: 'text-cyan-700',
      borderClass: 'border-cyan-200',
    },
    TWO_FACTOR_ENABLE: {
      icon: <ShieldIcon />,
      label: '2FA Enabled',
      color: 'emerald',
      dotColor: 'bg-emerald-500',
      bgClass: 'bg-emerald-50',
      textClass: 'text-emerald-700',
      borderClass: 'border-emerald-200',
    },
    TWO_FACTOR_DISABLE: {
      icon: <ShieldIcon />,
      label: '2FA Disabled',
      color: 'rose',
      dotColor: 'bg-rose-500',
      bgClass: 'bg-rose-50',
      textClass: 'text-rose-700',
      borderClass: 'border-rose-200',
    },
  };
  return (
    map[action] ?? {
      icon: <ClipboardIcon />,
      label: category || 'Activity',
      color: 'slate',
      dotColor: 'bg-slate-400',
      bgClass: 'bg-slate-50',
      textClass: 'text-slate-700',
      borderClass: 'border-slate-200',
    }
  );
}

/* ──────────────────────────────────────────────────────────────
   Inline SVG Icons (14×14, lightweight)
   ────────────────────────────────────────────────────────────── */

const iconClass = 'w-4 h-4';
function KeyIcon() {
  return (
    <svg
      className={iconClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z"
      />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg
      className={iconClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}
function MailIcon() {
  return (
    <svg
      className={iconClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
      />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg
      className={iconClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3"
      />
    </svg>
  );
}
function UserIcon() {
  return (
    <svg
      className={iconClass}
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
  );
}
function GearIcon() {
  return (
    <svg
      className={iconClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
function BotIcon() {
  return (
    <svg
      className={iconClass}
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
function UploadIcon() {
  return (
    <svg
      className={iconClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
      />
    </svg>
  );
}
function CheckCircleIcon() {
  return (
    <svg
      className={iconClass}
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
  );
}
function TrashIcon() {
  return (
    <svg
      className={iconClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg
      className={iconClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
      />
    </svg>
  );
}
function ShieldIcon() {
  return (
    <svg
      className={iconClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  );
}
function ClipboardIcon() {
  return (
    <svg
      className={iconClass}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z"
      />
    </svg>
  );
}
function ClockIcon() {
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
        d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}
function ArrowRightIcon() {
  return (
    <svg
      className="w-3.5 h-3.5 text-slate-400"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182"
      />
    </svg>
  );
}
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className || 'w-4 h-4'}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg
      className="w-4 h-4 text-slate-400"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────
   Framer Motion Variants
   ────────────────────────────────────────────────────────────── */

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, x: -24, scale: 0.97 },
  show: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 300, damping: 28 },
  },
};

const statCardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 260, damping: 22 },
  },
};

const expandVariants = {
  initial: { opacity: 0, height: 0, y: -8 },
  animate: {
    opacity: 1,
    height: 'auto' as const,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 30 },
  },
  exit: { opacity: 0, height: 0, y: -8, transition: { duration: 0.2 } },
};

/* ──────────────────────────────────────────────────────────────
   ActivityDiffViewer — rich before/after comparison
   ────────────────────────────────────────────────────────────── */

function ActivityDiffViewer({
  details,
  action,
}: {
  details: Record<string, unknown>;
  action: string;
}) {
  const [showRaw, setShowRaw] = useState(false);

  const rawChanges = Array.isArray(details.changes)
    ? (details.changes as { field: string; before: unknown; after: unknown }[])
    : [];

  const inferredChanges: { field: string; before: unknown; after: unknown }[] = [...rawChanges];

  if (inferredChanges.length === 0) {
    if (
      details.before &&
      details.after &&
      typeof details.before === 'object' &&
      typeof details.after === 'object'
    ) {
      const beforeObj = details.before as Record<string, unknown>;
      const afterObj = details.after as Record<string, unknown>;
      const allKeys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]));
      for (const k of allKeys) {
        if (beforeObj[k] !== afterObj[k]) {
          inferredChanges.push({
            field: formatFieldName(k),
            before: beforeObj[k],
            after: afterObj[k],
          });
        }
      }
    } else {
      const keys = Object.keys(details);
      const oldKeys = keys.filter((k) => k.startsWith('old_'));
      for (const oldKey of oldKeys) {
        const base = oldKey.replace(/^old_/, '');
        const newKey = `new_${base}`;
        if (newKey in details) {
          inferredChanges.push({
            field: formatFieldName(base),
            before: details[oldKey],
            after: details[newKey],
          });
        }
      }
    }
  }

  return (
    <motion.div
      variants={expandVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="mt-4 overflow-hidden"
    >
      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-5 shadow-sm">
        {/* Section header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-indigo-100">
              <svg
                className="w-3 h-3 text-indigo-600"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                />
              </svg>
            </span>
            What Changed
          </span>
          <button
            type="button"
            onClick={() => setShowRaw(!showRaw)}
            className="text-[11px] font-semibold text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer flex items-center gap-1"
          >
            <svg
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
              />
            </svg>
            {showRaw ? 'Hide JSON' : 'View JSON'}
          </button>
        </div>

        {/* Field-level diffs */}
        {inferredChanges.length > 0 && (
          <div className="space-y-3">
            {inferredChanges.map((change, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2 block">
                  {change.field}
                </span>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 mt-1">
                  {/* Before value */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 w-[3px] h-6 rounded-full bg-rose-400" />
                    <span className="text-sm font-medium text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-1.5 line-through decoration-rose-300 break-all">
                      {formatDiffVal(change.before)}
                    </span>
                  </div>

                  {/* Arrow */}
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.15 + idx * 0.05, type: 'spring', stiffness: 400 }}
                    className="shrink-0"
                  >
                    <ArrowRightIcon />
                  </motion.div>

                  {/* After value */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0 w-[3px] h-6 rounded-full bg-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5 break-all">
                      {formatDiffVal(change.after)}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Statement-specific metadata cards */}
        {action.startsWith('STATEMENT_') && (
          <div className="grid gap-3 sm:grid-cols-3 mt-3">
            {Boolean(details.file_name) && (
              <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  📄 File
                </span>
                <span className="text-sm font-semibold text-slate-800 truncate block">
                  {String(details.file_name)}
                </span>
              </div>
            )}
            {Boolean(details.bank) && (
              <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  🏦 Bank
                </span>
                <span className="text-sm font-semibold text-slate-800">{String(details.bank)}</span>
              </div>
            )}
            {details.transactions_count !== undefined && (
              <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  📊 Parsed
                </span>
                <span className="text-sm font-bold text-indigo-600">
                  {String(details.transactions_count)} txns
                </span>
              </div>
            )}
            {details.transactions_deleted !== undefined && (
              <div className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  🗑️ Removed
                </span>
                <span className="text-sm font-bold text-rose-600">
                  {String(details.transactions_deleted)} txns
                </span>
              </div>
            )}
          </div>
        )}

        {/* Generic key/value details */}
        {inferredChanges.length === 0 && !action.startsWith('STATEMENT_') && (
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(details)
              .filter(([k]) => k !== 'changes' && k !== 'before' && k !== 'after')
              .map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm"
                >
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    {formatFieldName(k)}
                  </span>
                  <span className="text-sm font-semibold text-slate-800">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
          </div>
        )}

        {/* Raw JSON payload */}
        <AnimatePresence>
          {showRaw && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 overflow-hidden"
            >
              <div className="rounded-xl bg-slate-900 p-4 text-xs text-emerald-400 font-mono overflow-x-auto shadow-inner border border-slate-700/50">
                <p className="text-[10px] uppercase font-bold text-slate-500 mb-2">
                  Raw Audit Payload
                </p>
                <pre className="whitespace-pre-wrap leading-relaxed">
                  {JSON.stringify(details, null, 2)}
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Skeleton Loader
   ────────────────────────────────────────────────────────────── */

function TimelineSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 animate-pulse">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-slate-200" />
            <div className="w-0.5 flex-1 bg-slate-100 mt-1" />
          </div>
          <div className="flex-1 space-y-2 pb-6">
            <div className="h-4 bg-slate-200 rounded-lg w-2/5" />
            <div className="h-3 bg-slate-100 rounded-lg w-3/5" />
            <div className="h-16 bg-slate-100 rounded-xl w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   Main Page Component
   ────────────────────────────────────────────────────────────── */

export default function ActivityLogsPage() {
  const router = useRouter();
  const prefs = useUserPreferences();
  const { t } = useTranslation();

  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = useCallback(
    async (currentPage = page, cat = category, q = search) => {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      if (!token) {
        router.replace('/auth');
        return;
      }

      try {
        const res = await activityLogAPI.getLogs(
          {
            page: currentPage,
            limit: 15,
            category: cat,
            search: q,
          },
          token,
        );
        setLogs(res.logs || []);
        setTotalPages(res.pagination?.totalPages || 1);
        setTotalRecords(res.pagination?.total || 0);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [page, category, search, router],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchLogs(page, category, search);
    }, 0);
    return () => clearTimeout(timer);
  }, [page, category, search, fetchLogs]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    setPage(1);
  };

  /* ── Quick‑stat counters from current result set ── */
  const quickStats = useMemo(() => {
    const security = logs.filter((l) => l.category === 'security').length;
    const profile = logs.filter((l) => l.category === 'profile').length;
    const financial = logs.filter((l) => l.category === 'financial').length;
    const prefs = logs.filter((l) => l.category === 'preferences').length;
    return { security, profile, financial, prefs };
  }, [logs]);

  /* ── Group logs by date ── */
  const groupedLogs = useMemo(() => {
    const groups: { label: string; logs: ActivityLog[] }[] = [];
    let currentLabel = '';
    for (const log of logs) {
      const label = dateGroupLabel(log.created_at);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, logs: [log] });
      } else {
        groups[groups.length - 1].logs.push(log);
      }
    }
    return groups;
  }, [logs]);

  const categories = [
    { id: 'all', label: t('allLogs', 'All'), icon: '📋' },
    { id: 'security', label: t('securityTab', 'Security'), icon: '🛡️' },
    { id: 'profile', label: t('profileTab', 'Profile'), icon: '👤' },
    { id: 'preferences', label: t('preferencesTab', 'Settings'), icon: '⚙️' },
    { id: 'financial', label: t('statementsTab', 'Financial'), icon: '💳' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="pb-12"
    >
      <AuthSessionGuard />

      {/* ═══════════════════════════════════════════════════════════════
          Hero Header
          ═══════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-blue-700 to-slate-900 p-6 sm:p-10 text-white shadow-xl">
        {/* Decorative blobs */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-blue-400/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-16 -left-16 w-48 h-48 bg-indigo-400/20 rounded-full blur-3xl" />

        <div className="relative mx-auto max-w-6xl">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <motion.span
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-200 backdrop-blur-sm border border-white/10"
              >
                <svg
                  className="w-3 h-3"
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
                Audit Trail
              </motion.span>
              <motion.h1
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight"
              >
                {t('activityTitle', 'Activity & Security Logs')}
              </motion.h1>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="mt-2 text-sm text-blue-200/80 max-w-xl leading-relaxed"
              >
                {t(
                  'activitySubtitle',
                  'Track every account update, security event, preference change, and financial import — with a complete before & after record.',
                )}
              </motion.p>
            </div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3, type: 'spring' }}
            >
              <Link
                href="/assistant"
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur-md transition-all hover:bg-white/20 hover:shadow-xl active:scale-[0.97] cursor-pointer border border-white/15"
              >
                <BotIcon />
                <span>{t('askAi', 'Ask AI')}</span>
              </Link>
            </motion.div>
          </div>

          {/* ── Quick Stat Cards ── */}
          {!loading && logs.length > 0 && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              {[
                {
                  label: 'Total Events',
                  value: totalRecords,
                  icon: '📊',
                  accent: 'from-white/10 to-white/5',
                },
                {
                  label: 'Security',
                  value: quickStats.security,
                  icon: '🛡️',
                  accent: 'from-emerald-500/20 to-emerald-500/5',
                },
                {
                  label: 'Profile',
                  value: quickStats.profile,
                  icon: '👤',
                  accent: 'from-blue-500/20 to-blue-500/5',
                },
                {
                  label: 'Financial',
                  value: quickStats.financial,
                  icon: '💳',
                  accent: 'from-amber-500/20 to-amber-500/5',
                },
              ].map((stat) => (
                <motion.div
                  key={stat.label}
                  variants={statCardVariants}
                  className={`rounded-xl bg-gradient-to-br ${stat.accent} backdrop-blur-sm border border-white/10 p-3.5`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-200/70">
                      {stat.label}
                    </span>
                    <span className="text-base">{stat.icon}</span>
                  </div>
                  <p className="mt-1 text-xl font-bold text-white">{stat.value}</p>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          Main Content Area
          ═══════════════════════════════════════════════════════════════ */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 mt-6">
        {/* ── Controls Bar ── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {/* Category Filter Pills */}
            <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100/80 p-1 border border-slate-200/60">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleCategoryChange(c.id)}
                  className={`rounded-lg px-3.5 py-2 text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                    category === c.id
                      ? 'bg-white text-indigo-700 shadow-sm border border-indigo-100 ring-1 ring-indigo-200/40'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-white/60'
                  }`}
                >
                  <span className="text-sm">{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-initial">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <SearchIcon />
                </div>
                <input
                  type="text"
                  placeholder="Search events…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full sm:w-64 rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-8 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-100 transition-all"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setSearch('');
                      setPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors cursor-pointer shadow-sm"
              >
                Search
              </button>
            </form>
          </div>
        </motion.div>

        {/* ── Error Alert ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2"
            >
              <span className="text-base">⚠️</span>
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════════════════════════════════════════════════════════════
            Timeline Card
            ═══════════════════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden"
        >
          {/* Timeline header */}
          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-100">
                  <ClockIcon />
                </span>
                Activity Timeline
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {totalRecords} event{totalRecords === 1 ? '' : 's'} recorded
                {search && (
                  <span className="text-indigo-500 font-medium">
                    {' '}
                    · matching &ldquo;{search}&rdquo;
                  </span>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchLogs(page, category, search)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition cursor-pointer bg-indigo-50 hover:bg-indigo-100 rounded-lg px-3 py-1.5"
            >
              <RefreshIcon />
              Refresh
            </button>
          </div>

          {/* Timeline body */}
          {loading ? (
            <TimelineSkeleton />
          ) : logs.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-14 text-center"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 mb-4">
                <span className="text-3xl">📭</span>
              </div>
              <p className="text-base font-semibold text-slate-800">No activity events found</p>
              <p className="mt-1.5 text-sm text-slate-500 max-w-sm mx-auto">
                {search || category !== 'all'
                  ? 'Try selecting another category or clearing your search.'
                  : 'Events will appear here as you use your account.'}
              </p>
              {(search || category !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setCategory('all');
                    setSearch('');
                    setSearchInput('');
                    setPage(1);
                  }}
                  className="mt-5 rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                >
                  Clear All Filters
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="show"
              className="px-6 py-4"
            >
              {groupedLogs.map((group, gi) => (
                <Fragment key={group.label}>
                  {/* ── Date Group Header ── */}
                  <motion.div
                    variants={itemVariants}
                    className="flex items-center gap-3 mb-4 mt-2"
                    style={gi > 0 ? { marginTop: '1.5rem' } : undefined}
                  >
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      {group.label}
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-slate-200 to-transparent" />
                    <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 rounded-md px-2 py-0.5">
                      {group.logs.length} event{group.logs.length === 1 ? '' : 's'}
                    </span>
                  </motion.div>

                  {/* ── Timeline entries ── */}
                  {group.logs.map((log, li) => {
                    const meta = getActionMeta(log.action, log.category);
                    const isExpanded = expandedLogId === log.id;
                    const hasDetails =
                      log.details &&
                      typeof log.details === 'object' &&
                      Object.keys(log.details).length > 0;
                    const isLast = li === group.logs.length - 1;

                    return (
                      <motion.div key={log.id} variants={itemVariants} className="flex gap-4 group">
                        {/* ── Timeline line & dot ── */}
                        <div className="flex flex-col items-center shrink-0 w-6">
                          <motion.div
                            whileHover={{ scale: 1.4 }}
                            className={`w-3 h-3 rounded-full ${meta.dotColor} ring-4 ring-white shadow-sm mt-1.5 z-10 transition-transform`}
                          />
                          {!isLast && (
                            <div className="w-0.5 flex-1 bg-gradient-to-b from-slate-200 to-slate-100 min-h-[24px]" />
                          )}
                        </div>

                        {/* ── Event content ── */}
                        <div className={`flex-1 pb-6 ${isLast ? 'pb-2' : ''}`}>
                          <motion.div
                            whileHover={{ x: 2 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            className={`rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow hover:shadow-md cursor-pointer ${
                              isExpanded ? 'ring-2 ring-indigo-100 border-indigo-200' : ''
                            }`}
                            onClick={() =>
                              hasDetails && setExpandedLogId(isExpanded ? null : log.id)
                            }
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                              <div className="flex items-start gap-3">
                                {/* Action icon */}
                                <div
                                  className={`shrink-0 w-9 h-9 rounded-xl ${meta.bgClass} border ${meta.borderClass} flex items-center justify-center ${meta.textClass}`}
                                >
                                  {meta.icon}
                                </div>

                                <div className="min-w-0">
                                  {/* Badge + description */}
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span
                                      className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-bold ${meta.bgClass} ${meta.textClass} ${meta.borderClass}`}
                                    >
                                      {meta.label}
                                    </span>
                                    <span className="text-sm font-medium text-slate-800 truncate">
                                      {log.description}
                                    </span>
                                  </div>

                                  {/* Timestamp row */}
                                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                                    <span className="inline-flex items-center gap-1 font-medium text-slate-500">
                                      <ClockIcon />
                                      {formatDateTime(
                                        log.created_at,
                                        prefs.dateFormat,
                                        prefs.timeFormat,
                                        prefs.timezone,
                                      )}
                                    </span>
                                    <span className="text-indigo-500 font-semibold bg-indigo-50 rounded-md px-1.5 py-0.5 text-[10px]">
                                      {relativeTime(log.created_at)}
                                    </span>
                                    {log.ip_address && (
                                      <span className="text-slate-400 font-mono text-[11px]">
                                        IP {log.ip_address}
                                      </span>
                                    )}
                                  </div>

                                  {/* Inline change preview (always visible for entries with diff data) */}
                                  {hasDetails &&
                                    !isExpanded &&
                                    (() => {
                                      const d = log.details as Record<string, unknown>;
                                      const rawChanges = Array.isArray(d.changes)
                                        ? (d.changes as {
                                            field: string;
                                            before: unknown;
                                            after: unknown;
                                          }[])
                                        : [];
                                      const previewChanges = [...rawChanges];
                                      if (
                                        previewChanges.length === 0 &&
                                        d.before &&
                                        d.after &&
                                        typeof d.before === 'object' &&
                                        typeof d.after === 'object'
                                      ) {
                                        const b = d.before as Record<string, unknown>;
                                        const a = d.after as Record<string, unknown>;
                                        for (const k of Object.keys(a)) {
                                          if (b[k] !== a[k])
                                            previewChanges.push({
                                              field: k,
                                              before: b[k],
                                              after: a[k],
                                            });
                                        }
                                      }
                                      if (previewChanges.length === 0) {
                                        const oldKeys = Object.keys(d).filter((k) =>
                                          k.startsWith('old_'),
                                        );
                                        for (const ok of oldKeys) {
                                          const base = ok.replace(/^old_/, '');
                                          const nk = `new_${base}`;
                                          if (nk in d)
                                            previewChanges.push({
                                              field: base,
                                              before: d[ok],
                                              after: d[nk],
                                            });
                                        }
                                      }
                                      if (previewChanges.length === 0) return null;
                                      const preview = previewChanges.slice(0, 2);
                                      return (
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                          {preview.map((c, i) => (
                                            <span
                                              key={i}
                                              className="inline-flex items-center gap-1 text-[11px] bg-slate-50 rounded-md border border-slate-200/80 px-2 py-0.5"
                                            >
                                              <span className="font-medium text-slate-500">
                                                {formatFieldName(c.field)}:
                                              </span>
                                              <span className="text-rose-500 line-through">
                                                {formatDiffVal(c.before)}
                                              </span>
                                              <span className="text-slate-400">→</span>
                                              <span className="text-emerald-600 font-semibold">
                                                {formatDiffVal(c.after)}
                                              </span>
                                            </span>
                                          ))}
                                          {previewChanges.length > 2 && (
                                            <span className="text-[10px] text-indigo-500 font-semibold">
                                              +{previewChanges.length - 2} more
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                </div>
                              </div>

                              {/* Expand/collapse indicator */}
                              {hasDetails && (
                                <div className="self-start sm:self-center shrink-0">
                                  <motion.div
                                    animate={{ rotate: isExpanded ? 180 : 0 }}
                                    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                                    className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                  >
                                    <ChevronDownIcon className="w-4 h-4" />
                                  </motion.div>
                                </div>
                              )}
                            </div>
                          </motion.div>

                          {/* ── Expanded diff panel ── */}
                          <AnimatePresence>
                            {isExpanded && hasDetails && (
                              <ActivityDiffViewer
                                details={log.details as Record<string, unknown>}
                                action={log.action}
                              />
                            )}
                          </AnimatePresence>
                        </div>
                      </motion.div>
                    );
                  })}
                </Fragment>
              ))}
            </motion.div>
          )}

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Page <span className="font-bold text-slate-700">{page}</span> of{' '}
                <span className="font-bold text-slate-700">{totalPages}</span>
                <span className="hidden sm:inline"> · {totalRecords} total records</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  ← Previous
                </button>

                {/* Page number indicators */}
                <div className="hidden sm:flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        type="button"
                        onClick={() => setPage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          pageNum === page
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </motion.div>
  );
}
