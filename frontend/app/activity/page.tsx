'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import BackButton from '@/components/BackButton';
import { activityLogAPI, ActivityLog, getErrorMessage } from '@/lib/api';
import { formatDateTime, useUserPreferences } from '@/lib/date';
import { useTranslation } from '@/lib/translations';

function formatFieldName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDiffVal(val: unknown): string {
  if (val === null || val === undefined || val === '') return '(none)';
  if (typeof val === 'boolean') return val ? 'Enabled' : 'Disabled';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

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
    <div className="mt-3.5 ml-3 sm:ml-8 rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 shadow-2xs">
      <div className="flex items-center justify-between mb-3 border-b border-slate-200/70 pb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
          <span>🔍</span> What Changed &amp; Event Details
        </span>
        <button
          type="button"
          onClick={() => setShowRaw(!showRaw)}
          className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition cursor-pointer"
        >
          {showRaw ? 'Hide Raw Payload' : 'View Raw Payload'}
        </button>
      </div>

      {inferredChanges.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700">Modified Fields:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {inferredChanges.map((change, idx) => (
              <div
                key={idx}
                className="flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-3 shadow-2xs"
              >
                <span className="text-xs font-bold text-slate-800">{change.field}</span>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span className="inline-flex items-center rounded-lg bg-rose-50 border border-rose-200/80 px-2 py-0.5 font-medium text-rose-700 line-through">
                    {formatDiffVal(change.before)}
                  </span>
                  <span className="text-slate-400 font-bold">→</span>
                  <span className="inline-flex items-center rounded-lg bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 font-semibold text-emerald-700">
                    {formatDiffVal(change.after)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {action.startsWith('STATEMENT_') && (
        <div className="grid gap-2 sm:grid-cols-3 text-xs mt-2">
          {Boolean(details.file_name) && (
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                File Name
              </span>
              <span className="font-semibold text-slate-800 truncate block">
                {String(details.file_name)}
              </span>
            </div>
          )}
          {Boolean(details.bank) && (
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Bank</span>
              <span className="font-semibold text-slate-800">{String(details.bank)}</span>
            </div>
          )}
          {details.transactions_count !== undefined && (
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Transactions
              </span>
              <span className="font-bold text-indigo-600">
                {String(details.transactions_count)} parsed
              </span>
            </div>
          )}
          {details.transactions_deleted !== undefined && (
            <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Transactions Removed
              </span>
              <span className="font-bold text-rose-600">
                {String(details.transactions_deleted)} deleted
              </span>
            </div>
          )}
        </div>
      )}

      {inferredChanges.length === 0 && !action.startsWith('STATEMENT_') && (
        <div className="grid gap-2 sm:grid-cols-2 text-xs">
          {Object.entries(details)
            .filter(([k]) => k !== 'changes' && k !== 'before' && k !== 'after')
            .map(([k, v]) => (
              <div key={k} className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  {formatFieldName(k)}
                </span>
                <span className="font-semibold text-slate-800">
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </span>
              </div>
            ))}
        </div>
      )}

      {showRaw && (
        <div className="mt-3 rounded-xl bg-slate-900 p-3 text-xs text-emerald-400 font-mono overflow-x-auto shadow-inner">
          <p className="text-[10px] uppercase font-bold text-slate-400 mb-1">Raw Audit Payload</p>
          <pre className="whitespace-pre-wrap">{JSON.stringify(details, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

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

  const getActionBadge = (action: string, cat: string) => {
    switch (action) {
      case 'PASSWORD_CHANGE':
      case 'PASSWORD_RESET':
        return {
          icon: '🔑',
          label: 'Password',
          className: 'bg-amber-100 text-amber-800 border-amber-200',
        };
      case 'LOGIN':
        return {
          icon: '🔐',
          label: 'Sign In',
          className: 'bg-emerald-100 text-emerald-800 border-emerald-200',
        };
      case 'EMAIL_CHANGE':
        return {
          icon: '✉️',
          label: 'Email',
          className: 'bg-blue-100 text-blue-800 border-blue-200',
        };
      case 'PHONE_CHANGE':
        return {
          icon: '📱',
          label: 'Mobile',
          className: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        };
      case 'NAME_CHANGE':
        return {
          icon: '👤',
          label: 'Name',
          className: 'bg-sky-100 text-sky-800 border-sky-200',
        };
      case 'PREFERENCES_UPDATE':
        return {
          icon: '⚙️',
          label: 'Preferences',
          className: 'bg-purple-100 text-purple-800 border-purple-200',
        };
      case 'AI_SETTINGS_UPDATE':
        return {
          icon: '🤖',
          label: 'AI Setup',
          className: 'bg-violet-100 text-violet-800 border-violet-200',
        };
      case 'STATEMENT_UPLOAD':
        return {
          icon: '📤',
          label: 'Upload',
          className: 'bg-teal-100 text-teal-800 border-teal-200',
        };
      case 'STATEMENT_CONFIRM':
        return {
          icon: '✅',
          label: 'Import',
          className: 'bg-green-100 text-green-800 border-green-200',
        };
      case 'STATEMENT_DELETE':
        return {
          icon: '🗑️',
          label: 'Delete',
          className: 'bg-rose-100 text-rose-800 border-rose-200',
        };
      case 'DATA_EXPORT':
        return {
          icon: '📦',
          label: 'Export',
          className: 'bg-cyan-100 text-cyan-800 border-cyan-200',
        };
      default:
        return {
          icon: '📋',
          label: cat || 'Activity',
          className: 'bg-slate-100 text-slate-800 border-slate-200',
        };
    }
  };

  const categories = [
    { id: 'all', label: t('allLogs', 'All Logs') },
    { id: 'security', label: t('securityTab', 'Security') },
    { id: 'profile', label: t('profileTab', 'Profile') },
    { id: 'preferences', label: t('preferencesTab', 'Preferences') },
    { id: 'financial', label: t('statementsTab', 'Statements') },
  ];

  return (
    <div className="min-h-screen bg-slate-50/70 pb-20 text-slate-900">
      <AuthSessionGuard />

      {/* Top Header */}
      <section className="relative overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 py-10 px-4 sm:px-6 lg:px-8 text-white shadow-md">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4">
            <BackButton
              fallbackHref="/dashboard"
              variant="dark"
              label={t('back', 'Back to Dashboard')}
            />
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-blue-200 backdrop-blur-xs">
                Audit Trail
              </span>
              <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight">
                {t('activityTitle', 'Activity & Security Logs')}
              </h1>
              <p className="mt-1 text-sm text-slate-300">
                {t(
                  'activitySubtitle',
                  'Track all important account updates, security events, preference shifts, and financial imports.',
                )}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/assistant"
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-xs font-semibold text-white shadow-xs backdrop-blur-md transition hover:bg-white/20 active:scale-98 cursor-pointer border border-white/10"
              >
                <span>💬</span>
                <span>{t('askAi', 'Ask AI About Activity')}</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Main Container */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 -mt-5">
        {/* Controls Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            {/* Category Filter Pills */}
            <div className="inline-flex flex-wrap gap-1.5 rounded-2xl bg-slate-100/90 p-1.5 border border-slate-200/80 shadow-2xs">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleCategoryChange(c.id)}
                  className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all duration-150 cursor-pointer ${
                    category === c.id
                      ? 'bg-white text-blue-700 shadow-xs border border-blue-100 scale-[1.02]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search logs…"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full sm:w-60 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-hidden"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchInput('');
                      setSearch('');
                      setPage(1);
                    }}
                    className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition cursor-pointer"
              >
                Search
              </button>
            </form>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Activity Table Card */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-xs overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Activity Timeline</h2>
              <p className="text-xs text-slate-500">
                {totalRecords} recorded event{totalRecords === 1 ? '' : 's'} matching criteria
              </p>
            </div>
            <button
              type="button"
              onClick={() => fetchLogs(page, category, search)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800 transition cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500 space-y-3">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <p>Loading activity records…</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center">
              <span className="text-3xl">📭</span>
              <p className="mt-2 text-sm font-semibold text-slate-800">No activity events found</p>
              <p className="mt-1 text-xs text-slate-500">
                {search || category !== 'all'
                  ? 'Try selecting another category or clearing your search filter.'
                  : 'Events will be recorded here as you update your account, settings, and statements.'}
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
                  className="mt-4 rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-x-auto">
              {logs.map((log) => {
                const badge = getActionBadge(log.action, log.category);
                const isExpanded = expandedLogId === log.id;
                const hasDetails =
                  log.details &&
                  typeof log.details === 'object' &&
                  Object.keys(log.details).length > 0;

                return (
                  <div key={log.id} className="p-5 hover:bg-slate-50/60 transition">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-start gap-3.5">
                        <span className="text-xl shrink-0 mt-0.5">{badge.icon}</span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                            <span className="text-xs font-semibold text-slate-900">
                              {log.description}
                            </span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                              <svg
                                className="h-3.5 w-3.5 text-slate-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              {formatDateTime(
                                log.created_at,
                                prefs.dateFormat,
                                prefs.timeFormat,
                                prefs.timezone,
                              )}
                            </span>
                            {log.ip_address && (
                              <span className="text-slate-400">IP: {log.ip_address}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {hasDetails && (
                        <button
                          type="button"
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                          className="self-start sm:self-center text-xs font-medium text-indigo-600 hover:text-indigo-800 transition cursor-pointer"
                        >
                          {isExpanded ? 'Hide Details ▲' : 'View Details ▼'}
                        </button>
                      )}
                    </div>

                    {/* Expandable Visual Diff & Metadata Inspector */}
                    {isExpanded && hasDetails && (
                      <ActivityDiffViewer
                        details={log.details as Record<string, unknown>}
                        action={log.action}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="border-t border-slate-200 bg-slate-50/50 px-6 py-4 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Page {page} of {totalPages} ({totalRecords} records)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
