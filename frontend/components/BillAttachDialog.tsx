'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, apiGet, apiPost, getErrorMessage } from '@/lib/api';
import { getAiProviderHeaders } from '@/lib/aiProvider';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface BillLineItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
}

export interface Bill {
  id: string;
  fileName: string;
  merchantName: string | null;
  billTotal: number | null;
  billDate: string | null;
  status: string;
  lineItems: BillLineItem[];
}

interface UploadResult {
  bill: Bill;
  mismatch: boolean;
  reason?: string;
  difference?: number;
  message?: string;
}

const currency = (value: number) =>
  `₹${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Attaches a merchant bill to a single transaction.
 *
 * A bill is detail about money the bank statement already accounts for, so
 * confirming one never creates a transaction — it only adds line items to the
 * one it is attached to.
 */
export default function BillAttachDialog({
  transactionId,
  transactionDescription,
  transactionAmount,
  onClose,
  onAttached,
}: {
  transactionId: string | null;
  transactionDescription: string;
  transactionAmount: number;
  onClose: () => void;
  onAttached: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [existing, setExisting] = useState<Bill[]>([]);
  const [preview, setPreview] = useState<UploadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'confirm' | 'discard' | null>(null);
  const [error, setError] = useState('');

  const loadExisting = useCallback(async () => {
    if (!transactionId) return;
    try {
      const token = localStorage.getItem('token') ?? undefined;
      const data = await apiGet<{ bills: Bill[] }>(
        `${API_BASE_URL}/api/transactions/${transactionId}/bills`,
        token,
      );
      setExisting(data.bills.filter((bill) => bill.status === 'confirmed'));
    } catch {
      // A failure to list existing bills should not block attaching a new one.
      setExisting([]);
    }
  }, [transactionId]);

  useEffect(() => {
    void Promise.resolve().then(loadExisting);
  }, [loadExisting]);

  if (!transactionId) return null;

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiFetch(`${API_BASE_URL}/api/transactions/${transactionId}/bills`, {
        method: 'POST',
        timeout: 120000,
        retries: 0,
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
          ...getAiProviderHeaders(),
        },
        body: formData,
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Upload failed (${response.status})`);
      }

      setPreview((await response.json()) as UploadResult);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview) return;
    setBusy('confirm');
    setError('');
    try {
      const token = localStorage.getItem('token') ?? undefined;
      await apiPost(
        `${API_BASE_URL}/api/transactions/${transactionId}/bills/${preview.bill.id}/confirm`,
        {},
        token,
      );
      onAttached();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(null);
    }
  };

  const handleDiscard = async () => {
    if (!preview) return;
    setBusy('discard');
    try {
      const token = localStorage.getItem('token') ?? undefined;
      await apiPost(
        `${API_BASE_URL}/api/transactions/${transactionId}/bills/${preview.bill.id}/discard`,
        {},
        token,
      );
      setPreview(null);
      setFile(null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-surface p-6 shadow-xl">
        <h2 className="text-xl font-bold text-ink">Attach a bill</h2>
        <p className="mt-1 text-sm text-ink-2">
          {transactionDescription} &middot; {currency(transactionAmount)}
        </p>

        {existing.length > 0 && (
          <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3 text-sm">
            <p className="font-medium text-ink-2">Already attached</p>
            <ul className="mt-1 space-y-1 text-ink-2">
              {existing.map((bill) => (
                <li key={bill.id}>
                  {bill.merchantName} &middot; {bill.lineItems.length} items
                  {bill.billTotal !== null && ` · ${currency(bill.billTotal)}`}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-lg border-l-4 border-red-600 bg-red-50 p-3 text-sm font-medium text-red-800">
            {error}
          </div>
        )}

        {!preview ? (
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-ink-2">
                Bill or invoice (PDF or Excel, max 10MB)
              </span>
              <input
                type="file"
                accept=".pdf,.xlsx,.xls"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-ink-2 file:mr-4 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100"
              />
            </label>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleUpload()}
                disabled={!file || loading}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Reading bill...' : 'Upload and preview'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-line-strong px-4 py-2.5 font-semibold text-ink-2 hover:bg-surface-2"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Nothing is saved yet. Review the extracted items, then confirm.
            </div>

            {preview.mismatch && preview.message && (
              <div className="rounded-lg border border-orange-300 bg-orange-50 p-3 text-sm text-orange-900">
                <p className="font-semibold">Totals do not match</p>
                <p className="mt-1">{preview.message}</p>
                <p className="mt-1 text-xs">
                  This is often fine — tips, partial refunds, or delivery charged separately. You
                  can still attach it.
                </p>
              </div>
            )}

            <div className="rounded-lg border border-line p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-3">Merchant</span>
                <span className="font-medium text-ink">{preview.bill.merchantName}</span>
              </div>
              {preview.bill.billDate && (
                <div className="mt-1 flex justify-between">
                  <span className="text-ink-3">Bill date</span>
                  <span className="font-medium text-ink">{preview.bill.billDate}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between">
                <span className="text-ink-3">Bill total</span>
                <span className="font-medium text-ink">
                  {preview.bill.billTotal === null ? '—' : currency(preview.bill.billTotal)}
                </span>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-line">
              <table className="min-w-full divide-y divide-line text-sm">
                <thead className="bg-surface-2">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-ink-2">Item</th>
                    <th className="px-3 py-2 text-right font-semibold text-ink-2">Qty</th>
                    <th className="px-3 py-2 text-right font-semibold text-ink-2">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {preview.bill.lineItems.map((item, index) => (
                    <tr key={`${item.description}-${index}`}>
                      <td className="px-3 py-2 text-ink">{item.description}</td>
                      <td className="px-3 py-2 text-right text-ink-2">{item.quantity ?? '—'}</td>
                      <td className="px-3 py-2 text-right font-medium text-ink">
                        {currency(item.amount)}
                      </td>
                    </tr>
                  ))}
                  {preview.bill.lineItems.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-4 text-center text-ink-3">
                        No line items could be read from this bill.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={busy !== null}
                className="flex-1 rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === 'confirm' ? 'Attaching...' : 'Confirm and attach'}
              </button>
              <button
                type="button"
                onClick={() => void handleDiscard()}
                disabled={busy !== null}
                className="rounded-lg border border-red-300 px-4 py-2.5 font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy === 'discard' ? 'Discarding...' : 'Discard'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
