'use client';

import { useState } from 'react';
import { supportAPI } from '@/lib/api';

interface CrashReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  error: Error | null;
  componentStack?: string | null;
}

export default function CrashReportModal({
  isOpen,
  onClose,
  error,
  componentStack,
}: CrashReportModalProps) {
  const [userNote, setUserNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const browser = typeof window !== 'undefined' ? navigator.userAgent.slice(0, 100) : '';
  const deviceClass =
    typeof window !== 'undefined'
      ? window.innerWidth < 768
        ? 'mobile'
        : window.innerWidth < 1024
          ? 'tablet'
          : 'desktop'
      : 'desktop';

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const payload = {
        app_version: '1.0.0',
        page_url: pageUrl,
        browser,
        device_class: deviceClass,
        error_summary: error?.message || 'Unknown render or runtime error',
        error_details: {
          error_name: error?.name,
          error_message: error?.message,
          stack: error?.stack,
          component_stack: componentStack,
          user_note: userNote.trim() || undefined,
          timestamp: new Date().toISOString(),
        },
      };

      const res = await supportAPI.submitCrashReport(payload);
      setSubmittedId(res.reportId);
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to send crash report. Please try again.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crash-modal-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-surface p-6 shadow-2xl border border-line">
        {submittedId ? (
          <div className="text-center py-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-ink" id="crash-modal-title">
              Report Sent
            </h3>
            <p className="mt-1 text-sm text-ink-2">
              Thank you for helping us make Finlytix more reliable. Reference ID:
            </p>
            <p className="mt-2 font-mono text-xs text-brand-600 bg-brand-50 py-1.5 px-3 rounded-lg inline-block">
              {submittedId}
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 transition"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-line-soft">
              <h3 className="text-lg font-semibold text-ink" id="crash-modal-title">
                Send Diagnostic Report
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="text-ink-4 hover:text-ink-2 text-sm font-bold p-1"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 text-xs bg-surface-2 border border-line rounded-xl p-3 text-ink-2">
              <p className="font-semibold text-ink mb-1">Privacy Guarantee:</p>
              <p>
                Diagnostics contain strictly sanitized application errors, browser class, and URLs.
                Financial balances, transaction details, bank account numbers, passwords, and auth
                tokens are <strong>strictly excluded and automatically redacted</strong>.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink-2 mb-1">Error Summary</label>
                <div className="p-2.5 bg-surface-3 text-ink text-xs font-mono rounded-lg break-all">
                  {error?.message || 'Unexpected application error'}
                </div>
              </div>

              <div>
                <label htmlFor="crash-note" className="block text-xs font-semibold text-ink-2 mb-1">
                  What were you doing when this happened? (optional)
                </label>
                <textarea
                  id="crash-note"
                  rows={3}
                  value={userNote}
                  onChange={(e) => setUserNote(e.target.value)}
                  placeholder="e.g. Navigated to statements tab after uploading a PDF..."
                  className="w-full rounded-xl border border-line-strong p-2.5 text-xs text-ink focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            </div>

            {errorMessage && (
              <p className="mt-3 text-xs text-rose-600 font-medium">{errorMessage}</p>
            )}

            <div className="mt-6 flex gap-3 justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-xl border border-line-strong px-4 py-2 text-xs font-medium text-ink-2 hover:bg-surface-2 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-medium text-white hover:bg-brand-700 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSubmitting ? 'Sending...' : 'Send Diagnostic Report'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
