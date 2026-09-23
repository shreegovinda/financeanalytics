'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiGet, apiPost, getErrorMessage } from '@/lib/api';
import BackButton from '@/components/BackButton';
import { formatMonthYear, useUserPreferences } from '@/lib/date';
import { useTranslation } from '@/lib/translations';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface DraftTransaction {
  date: string;
  description: string;
  amount: number;
  type: 'debit' | 'credit';
}

interface StatementDraft {
  statementId: string;
  bankName: string;
  detectedBankName: string | null;
  fileName: string;
  fileFormat: string;
  statementMonth: string;
  uploadedAt: string;
  transactionCount: number;
  totalDebit: number;
  totalCredit: number;
  transactions: DraftTransaction[];
}

export default function StatementPreviewPage() {
  const router = useRouter();
  const params = useParams();
  const { t } = useTranslation();
  const prefs = useUserPreferences();
  const currency = (value: number) => prefs.formatMoney(value);
  const statementId = String(params?.id ?? '');

  const [draft, setDraft] = useState<StatementDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'confirm' | 'discard' | null>(null);
  const [error, setError] = useState('');

  const loadDraft = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token') ?? undefined;
      const data = await apiGet<StatementDraft>(
        `${API_BASE_URL}/api/upload/${statementId}/draft`,
        token,
      );
      setDraft(data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [statementId]);

  useEffect(() => {
    if (statementId) {
      void Promise.resolve().then(loadDraft);
    }
  }, [statementId, loadDraft]);

  const handleConfirm = async () => {
    setBusy('confirm');
    setError('');
    try {
      const token = localStorage.getItem('token') ?? undefined;
      await apiPost(`${API_BASE_URL}/api/upload/${statementId}/confirm`, {}, token);
      router.replace('/statements');
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(null);
    }
  };

  const handleDiscard = async () => {
    setBusy('discard');
    setError('');
    try {
      const token = localStorage.getItem('token') ?? undefined;
      await apiPost(`${API_BASE_URL}/api/upload/${statementId}/discard`, {}, token);
      router.replace('/statements');
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-5xl animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-gray-200" />
          <div className="h-32 rounded bg-gray-200" />
          <div className="h-96 rounded bg-gray-200" />
        </div>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-3xl">
          <BackButton />
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-6">
            <h1 className="text-lg font-semibold text-red-900">No pending statement</h1>
            <p className="mt-2 text-sm text-red-800">
              {error || 'This statement has no draft awaiting review. It may already be imported.'}
            </p>
            <button
              type="button"
              onClick={() => router.replace('/statements')}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Back to statements
            </button>
          </div>
        </div>
      </div>
    );
  }

  const net = Number(draft.totalCredit) - Number(draft.totalDebit);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-5xl">
        <BackButton fallbackHref="/statements" label="Back to Statements" />

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-3xl font-bold text-gray-900">Review before importing</h1>
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-blue-800">
                {formatMonthYear(draft.statementMonth)}
              </span>
            </div>
            <p className="mt-1 text-gray-600">
              Statement for <span className="font-semibold text-gray-800">{draft.bankName}</span> is
              saved as a draft. Review transactions below or return later.
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/statements')}
            className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-2xs transition-all hover:bg-gray-50 active:scale-95 cursor-pointer"
          >
            Review later
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          These {draft.transactionCount} transactions are held for review and are not in your
          dashboard or analytics yet.
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label="Transactions" value={String(draft.transactionCount)} />
          <SummaryCard label="Total debits" value={currency(draft.totalDebit)} tone="debit" />
          <SummaryCard label="Total credits" value={currency(draft.totalCredit)} tone="credit" />
          <SummaryCard
            label="Net"
            value={`${net >= 0 ? '+' : '-'}${currency(Math.abs(net))}`}
            tone={net >= 0 ? 'credit' : 'debit'}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-700 shadow-xs">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail label="File Name" value={draft.fileName} />
            <div>
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                File Type / Format
              </span>
              <span
                className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                  (draft.fileFormat?.toUpperCase() || 'PDF') === 'PDF'
                    ? 'border border-red-200 bg-red-50 text-red-700'
                    : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                }`}
              >
                {draft.fileFormat?.toUpperCase() || 'PDF'}
              </span>
            </div>
            <Detail
              label="Statement Period"
              value={`${formatMonthYear(draft.statementMonth)} (${draft.statementMonth})`}
            />
            <Detail
              label="Bank"
              value={
                draft.detectedBankName && draft.detectedBankName !== draft.bankName
                  ? `${draft.bankName} (detected: ${draft.detectedBankName})`
                  : draft.bankName
              }
            />
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border-l-4 border-red-600 bg-red-50 p-4 text-sm font-medium text-red-800">
            {error}
          </div>
        )}

        <div className="mt-6 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    {t('date', 'Date')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    {t('description', 'Description')}
                  </th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">
                    {t('type', 'Type')}
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">
                    {t('amount', 'Amount')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {draft.transactions.map((txn, index) => (
                  <tr key={`${txn.date}-${index}`} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-700">{txn.date}</td>
                    <td className="px-4 py-3 text-gray-900">{txn.description}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          txn.type === 'credit'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {txn.type}
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${
                        txn.type === 'credit' ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {currency(txn.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy !== null}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white shadow-xs transition hover:bg-blue-700 active:scale-98 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>
              {busy === 'confirm'
                ? 'Importing...'
                : `Confirm import of ${draft.transactionCount} transactions`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => void handleDiscard()}
            disabled={busy !== null}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-5 py-3 font-semibold text-red-700 shadow-xs transition hover:bg-red-50 active:scale-98 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <span>{busy === 'discard' ? 'Discarding…' : 'Discard Draft'}</span>
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-gray-500">
          Discarding frees {draft.statementMonth} so you can upload it again.
        </p>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'debit' | 'credit';
}) {
  const toneClass =
    tone === 'debit' ? 'text-red-700' : tone === 'credit' ? 'text-green-700' : 'text-gray-900';
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}
