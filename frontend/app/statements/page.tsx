'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import BackButton from '@/components/BackButton';
import FileUploadForm from '@/components/FileUploadForm';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { apiGet, getErrorMessage } from '@/lib/api';
import { notifyFinanceChanged, subscribeFinanceChanges } from '@/lib/financeRefresh';
import { formatDate, formatMonthYear } from '@/lib/date';
import { TableSkeletonLoader } from '@/components/Skeleton';
import StatementProcessingProgress, {
  isStatementProcessing,
} from '@/components/StatementProcessingProgress';
import { useTranslation } from '@/lib/translations';

interface Statement {
  id: string;
  bank_name: string;
  file_name: string;
  uploaded_at: string;
  status: string;
  processing_stage?: string | null;
  processing_progress?: number | null;
  processing_error?: string | null;
  processed_at?: string | null;
  file_available?: boolean;
  statement_month?: string;
  file_format?: string;
}

export default function StatementsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadVersion, setUploadVersion] = useState(0);
  const [downloading, setDownloading] = useState('');
  const [notice, setNotice] = useState('');
  const [deleteDialog, setDeleteDialog] = useState({
    isOpen: false,
    statementId: '',
    fileName: '',
  });

  async function fetchStatements() {
    try {
      const token = localStorage.getItem('token');
      const data = await apiGet<Statement[]>(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/upload`,
        token ?? undefined,
      );
      setStatements(data);
      setError('');
    } catch (err) {
      setError('Failed to load statements');
      console.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth');
      return;
    }

    void Promise.resolve().then(fetchStatements);
    return subscribeFinanceChanges(() => {
      void fetchStatements();
    });
  }, [router]);

  useEffect(() => {
    if (!statements.some(isStatementProcessing)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchStatements();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [statements]);

  const handleUploadSuccess = (statementId?: string) => {
    if (statementId) {
      // Extraction is held for review; take the user there rather than leaving
      // them on a list where the import looks finished.
      router.push(`/statements/${statementId}/preview`);
      return;
    }
    void fetchStatements();
  };

  const openDeleteDialog = (statementId: string, fileName: string) => {
    setDeleteDialog({ isOpen: true, statementId, fileName });
  };

  const closeDeleteDialog = () => {
    setDeleteDialog({ isOpen: false, statementId: '', fileName: '' });
  };

  const confirmDelete = async () => {
    const { statementId } = deleteDialog;
    closeDeleteDialog();

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/upload/${statementId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete statement');
      }

      // Refresh the statements list
      await fetchStatements();
      setUploadVersion((value) => value + 1);
      notifyFinanceChanged();
      setNotice(
        'Statement and related transactions deleted. Totals are refreshed and this bank’s month is available again.',
      );
    } catch (err) {
      setError(`Failed to delete statement: ${getErrorMessage(err)}`);
      console.error('Delete error:', err);
    }
  };

  const downloadStatement = async (statement: Statement) => {
    setDownloading(statement.id);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/upload/${statement.id}/file`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error((await response.json()).error || 'Download failed');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = statement.file_name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setDownloading('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AuthSessionGuard />
      <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <BackButton className="mb-6" />

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Bank Statements</h1>
          <p className="text-gray-600">Upload and manage your bank statements</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Upload New Statement</h2>
          <FileUploadForm key={uploadVersion} onUploadSuccess={handleUploadSuccess} />
        </div>

        {notice && (
          <p role="status" className="mb-4 rounded-lg bg-green-50 p-4 text-green-800">
            {notice}
          </p>
        )}
        {loading ? (
          <TableSkeletonLoader rows={5} />
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Your Statements</h2>
            </div>

            {error ? (
              <div className="px-6 py-8 bg-red-50 text-red-700">{error}</div>
            ) : statements.length === 0 ? (
              <div className="px-6 py-8 text-center text-gray-500">
                No statements uploaded yet. Upload your first statement above!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
                        {t('banksTabName', 'Bank')}
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
                        Period
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
                        File & Format
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
                        Status
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
                        Progress
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
                        {t('date', 'Uploaded')}
                      </th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-700">
                        {t('actions', 'Actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {statements.map((statement) => {
                      const detectedFormat =
                        statement.file_format ||
                        (statement.file_name.toLowerCase().endsWith('.xlsx') ? 'XLSX' : 'PDF');
                      return (
                        <tr
                          key={statement.id}
                          className="transition-colors hover:bg-slate-50/80 cursor-pointer"
                          onClick={() =>
                            router.push(
                              statement.status === 'pending_review'
                                ? `/statements/${statement.id}/preview`
                                : `/statements/${statement.id}`,
                            )
                          }
                        >
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-semibold text-gray-900">
                            {statement.bank_name}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm">
                            <span className="font-semibold text-slate-800">
                              {formatMonthYear(statement.statement_month)}
                            </span>
                            {statement.statement_month && (
                              <span className="block font-mono text-xs text-slate-400">
                                {statement.statement_month}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                                  detectedFormat === 'PDF'
                                    ? 'border border-red-200 bg-red-50 text-red-700'
                                    : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                }`}
                              >
                                {detectedFormat}
                              </span>
                              <span
                                className="max-w-[200px] truncate font-medium text-gray-700"
                                title={statement.file_name}
                              >
                                {statement.file_name}
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-6 py-4">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                                statement.status === 'completed'
                                  ? 'bg-green-100 text-green-800'
                                  : statement.status === 'processing'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : statement.status === 'pending_review'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {statement.status === 'pending_review'
                                ? 'Needs review'
                                : statement.status.charAt(0).toUpperCase() +
                                  statement.status.slice(1)}
                            </span>
                            {statement.status === 'pending_review' && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  router.push(`/statements/${statement.id}/preview`);
                                }}
                                className="mt-1 block text-xs font-semibold text-blue-600 underline hover:text-blue-800 cursor-pointer"
                              >
                                Review now
                              </button>
                            )}
                          </td>
                          <td className="min-w-72 px-6 py-4">
                            <StatementProcessingProgress statement={statement} />
                          </td>
                          <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-600">
                            {formatDate(statement.uploaded_at)}
                          </td>
                          <td
                            className="whitespace-nowrap px-6 py-4 text-sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  router.push(
                                    statement.status === 'pending_review'
                                      ? `/statements/${statement.id}/preview`
                                      : `/statements/${statement.id}`,
                                  )
                                }
                                title="Preview statement details"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200/80 bg-indigo-50/70 px-3 py-1.5 text-xs font-semibold text-indigo-700 shadow-2xs transition-all hover:bg-indigo-100 hover:text-indigo-900 hover:shadow-xs active:scale-95 cursor-pointer"
                              >
                                <svg
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                  />
                                </svg>
                                <span>{t('preview', 'Preview')}</span>
                              </button>
                              <button
                                type="button"
                                disabled={!statement.file_available || downloading === statement.id}
                                title={
                                  statement.file_available
                                    ? 'Download original file'
                                    : 'Original file was not retained for this older upload'
                                }
                                onClick={() => void downloadStatement(statement)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-2xs transition-all hover:bg-emerald-100 hover:text-emerald-900 hover:shadow-xs active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-50/70 cursor-pointer"
                              >
                                <svg
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                  />
                                </svg>
                                <span>
                                  {downloading === statement.id
                                    ? 'Downloading…'
                                    : t('download', 'Download')}
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openDeleteDialog(statement.id, statement.file_name)}
                                title="Delete statement and related transactions"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200/80 bg-rose-50/70 px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-2xs transition-all hover:bg-rose-100 hover:text-rose-900 hover:shadow-xs active:scale-95 cursor-pointer"
                              >
                                <svg
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                                <span>{t('delete', 'Delete')}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmationDialog
        isOpen={deleteDialog.isOpen}
        title="Delete Statement?"
        message={`Are you sure you want to delete "${deleteDialog.fileName}"? This will remove the statement and all its associated transactions. This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        onConfirm={confirmDelete}
        onCancel={closeDeleteDialog}
      />
    </div>
  );
}
