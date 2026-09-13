'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import { userAPI, adminAPI, AdminMetrics, AdminCrashReport, getErrorMessage } from '@/lib/api';

export default function AdminDashboardPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [reports, setReports] = useState<AdminCrashReport[]>([]);
  const [totalReports, setTotalReports] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedReport, setSelectedReport] = useState<AdminCrashReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      void router.push('/auth');
      return;
    }

    try {
      const profile = await userAPI.getProfile(token);
      if (profile.user.role !== 'admin') {
        setIsAdmin(false);
        setIsLoading(false);
        return;
      }

      setIsAdmin(true);
      const [fetchedMetrics, fetchedReports] = await Promise.all([
        adminAPI.getMetrics(token),
        adminAPI.getCrashReports(token, {
          status: statusFilter === 'all' ? undefined : statusFilter,
        }),
      ]);

      setMetrics(fetchedMetrics);
      setReports(fetchedReports.reports);
      setTotalReports(fetchedReports.total);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [router, statusFilter]);

  useEffect(() => {
    void Promise.resolve().then(() => loadData());
  }, [loadData]);

  const handleUpdateStatus = async (
    reportId: string,
    newStatus: 'open' | 'investigating' | 'resolved',
  ) => {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
      setActionError(null);
      setActionSuccess(null);
      await adminAPI.updateCrashReportStatus(reportId, newStatus, token);
      setActionSuccess(`Report #${reportId.slice(0, 8)} updated to ${newStatus}`);
      await loadData();
      if (selectedReport?.id === reportId) {
        setSelectedReport((prev) => (prev ? { ...prev, status: newStatus } : null));
      }
    } catch (err) {
      setActionError(getErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-4 text-center">
        <div className="max-w-md rounded-2xl bg-white p-8 shadow-sm border border-slate-200">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 mb-4 font-bold text-xl">
            !
          </div>
          <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
          <p className="mt-2 text-sm text-slate-600">
            This dashboard is restricted to system administrators. Your account does not have admin
            privileges.
          </p>
          <div className="mt-6">
            <Link
              href="/dashboard"
              className="inline-block rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition"
            >
              Return to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AuthSessionGuard />
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white font-bold text-sm">
              AD
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">Admin Operations</h1>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                  System Admin
                </span>
              </div>
              <p className="text-xs text-slate-500">
                System health, reliability & compliance metrics
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Finance Dashboard
            </Link>
            <Link
              href="/settings"
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              Settings
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Privacy Note Banner */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-emerald-900 flex items-start gap-3 shadow-sm">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-200 text-emerald-800 text-xs font-bold">
            ✓
          </div>
          <div className="text-xs space-y-1">
            <p className="font-semibold text-emerald-950">Zero-Financial Data Guarantee</p>
            <p className="text-emerald-800">
              Admin queries strictly aggregate operational counts, error traces, and anonymized
              compliance statistics. Under no circumstances do admin routes query transactions,
              ledgers, account numbers, or chat messages.
            </p>
          </div>
        </div>

        {actionSuccess && (
          <div className="rounded-xl bg-emerald-100 p-3 text-xs text-emerald-800 font-medium">
            {actionSuccess}
          </div>
        )}
        {actionError && (
          <div className="rounded-xl bg-rose-100 p-3 text-xs text-rose-800 font-medium">
            {actionError}
          </div>
        )}

        {/* Operational Metrics Cards */}
        {metrics && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* User Statistics */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Users</p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">
                  {metrics.users.total_users}
                </span>
                <span className="text-xs text-emerald-600 font-medium">
                  {metrics.users.verified_users} verified
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {metrics.users.admin_users} admin account(s)
              </p>
            </div>

            {/* Statement Engine */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Statements
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">
                  {metrics.statements.total_statements}
                </span>
                <span className="text-xs text-emerald-600 font-medium">
                  {metrics.statements.completed_statements} parsed
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {metrics.statements.failed_statements} failed &bull;{' '}
                {metrics.drafts.pending_review_drafts} pending review
              </p>
            </div>

            {/* Storage Encryption */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                File Storage Security
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">
                  {metrics.storage.total_files}
                </span>
                <span className="text-xs text-indigo-600 font-medium">files stored</span>
              </div>
              <p className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                <span>{metrics.storage.encrypted_files} encrypted (AES-256)</span>
              </p>
            </div>

            {/* Crash Reports & Reliability */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Crash Reports
              </p>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-3xl font-bold text-slate-900">
                  {metrics.crash_reports.total_crash_reports}
                </span>
                <span className="text-xs text-amber-600 font-medium">
                  {metrics.crash_reports.open_crash_reports} open
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {metrics.crash_reports.investigating_crash_reports} investigating &bull;{' '}
                {metrics.crash_reports.resolved_crash_reports} resolved
              </p>
            </div>
          </div>
        )}

        {/* Secondary Metrics: Consent Audit & Privacy */}
        {metrics && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">Consent Policy Audit</h2>
              <div className="divide-y divide-slate-100 text-xs">
                {metrics.consent_breakdown.map((row) => (
                  <div key={row.consent_version} className="flex items-center justify-between py-2">
                    <span className="font-mono text-slate-700">Policy v{row.consent_version}</span>
                    <span className="font-semibold text-slate-900">{row.user_count} user(s)</span>
                  </div>
                ))}
                {metrics.consent_breakdown.length === 0 && (
                  <p className="text-slate-400 py-2">No consent records yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">
                Account Retention & AI Modes
              </h2>
              <div className="space-y-3 text-xs">
                <div className="flex items-center justify-between py-1">
                  <span className="text-slate-600">Total Anonymized Account Deletions:</span>
                  <span className="font-semibold text-slate-900">
                    {metrics.privacy.total_account_deletions}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-100">
                  <p className="font-medium text-slate-700 mb-2">AI Execution Modes:</p>
                  <div className="flex gap-4">
                    {metrics.ai_mode_distribution.map((m) => (
                      <div
                        key={m.ai_key_mode}
                        className="rounded-xl bg-slate-50 border border-slate-200 p-2.5 flex-1"
                      >
                        <p className="text-slate-500 uppercase text-[10px] font-semibold">
                          {m.ai_key_mode} mode
                        </p>
                        <p className="text-lg font-bold text-slate-900">{m.count}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Crash Reports Section */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-base font-bold text-slate-900">Crash & Diagnostic Reports</h2>
              <p className="text-xs text-slate-500">
                User-reported frontend issues and stack traces ({totalReports} total). Filter and
                update resolution status.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {['all', 'open', 'investigating', 'resolved'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium capitalize transition ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-3 px-2">Date</th>
                  <th className="py-3 px-2">Device / Browser</th>
                  <th className="py-3 px-2">Error Summary</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-2 whitespace-nowrap text-slate-500">
                      {new Date(report.created_at).toLocaleDateString()}{' '}
                      {new Date(report.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-2 whitespace-nowrap">
                      <span className="capitalize font-medium text-slate-800">
                        {report.device_class || 'desktop'}
                      </span>
                      <span className="text-slate-400 text-[10px] block truncate max-w-[140px]">
                        {report.page_url}
                      </span>
                    </td>
                    <td className="py-3 px-2 font-mono text-[11px] max-w-xs truncate">
                      {report.error_summary}
                    </td>
                    <td className="py-3 px-2 whitespace-nowrap">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          report.status === 'open'
                            ? 'bg-rose-100 text-rose-700'
                            : report.status === 'investigating'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {report.status}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right whitespace-nowrap space-x-2">
                      <button
                        onClick={async () => {
                          const token = localStorage.getItem('token');
                          if (token) {
                            const full = await adminAPI.getCrashReportById(report.id, token);
                            setSelectedReport(full.report);
                          }
                        }}
                        className="rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200 transition font-medium"
                      >
                        Inspect
                      </button>
                      {report.status !== 'resolved' && (
                        <button
                          onClick={() => handleUpdateStatus(report.id, 'resolved')}
                          className="rounded-lg bg-emerald-50 px-2.5 py-1 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition font-medium"
                        >
                          Resolve
                        </button>
                      )}
                      {report.status === 'open' && (
                        <button
                          onClick={() => handleUpdateStatus(report.id, 'investigating')}
                          className="rounded-lg bg-amber-50 px-2.5 py-1 text-amber-700 border border-amber-200 hover:bg-amber-100 transition font-medium"
                        >
                          Investigate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {reports.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-slate-400">
                      No crash reports found matching current filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Report Inspector Modal */}
        {selectedReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Crash Report #{selectedReport.id.slice(0, 8)}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Reported on {new Date(selectedReport.created_at).toLocaleString()}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-3 overflow-y-auto pr-1 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Error Summary</label>
                  <div className="p-2.5 bg-slate-100 text-slate-900 rounded-xl font-mono">
                    {selectedReport.error_summary}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Page URL</label>
                    <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 truncate">
                      {selectedReport.page_url}
                    </div>
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      Device / Browser
                    </label>
                    <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-600 truncate">
                      {selectedReport.device_class} &bull; {selectedReport.browser || 'Unknown'}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Redacted Diagnostic Details & Stack
                  </label>
                  <pre className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] overflow-x-auto max-h-64">
                    {typeof selectedReport.error_details === 'object'
                      ? JSON.stringify(selectedReport.error_details, null, 2)
                      : String(selectedReport.error_details)}
                  </pre>
                </div>
              </div>

              <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Status:</span>
                  <select
                    value={selectedReport.status}
                    onChange={(e) =>
                      handleUpdateStatus(
                        selectedReport.id,
                        e.target.value as 'open' | 'investigating' | 'resolved',
                      )
                    }
                    className="rounded-lg border border-slate-300 p-1 text-xs text-slate-900 focus:outline-none"
                  >
                    <option value="open">Open</option>
                    <option value="investigating">Investigating</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
                <button
                  onClick={() => setSelectedReport(null)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
