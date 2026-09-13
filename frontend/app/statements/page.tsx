'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import BackButton from '@/components/BackButton';
import FileUploadForm from '@/components/FileUploadForm';
import ConfirmationDialog from '@/components/ConfirmationDialog';
import { apiGet, getErrorMessage } from '@/lib/api';
import { notifyFinanceChanged, subscribeFinanceChanges } from '@/lib/financeRefresh';
import { formatDate } from '@/lib/date';
import { TableSkeletonLoader } from '@/components/Skeleton';
import StatementProcessingProgress, {
  isStatementProcessing,
} from '@/components/StatementProcessingProgress';

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
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Bank
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        File Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Progress
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Uploaded
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {statements.map((statement) => (
                      <tr
                        key={statement.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() =>
                          router.push(
                            statement.status === 'pending_review'
                              ? `/statements/${statement.id}/preview`
                              : `/statements/${statement.id}`,
                          )
                        }
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {statement.bank_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {statement.file_name}
                          <span className="block text-xs text-gray-500">
                            {statement.statement_month} · {statement.file_format}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
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
                              className="mt-1 block text-xs font-semibold text-blue-600 underline hover:text-blue-800"
                            >
                              Review now
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-4 min-w-72">
                          <StatementProcessingProgress statement={statement} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatDate(statement.uploaded_at)}
                        </td>
                        <td
                          className="px-6 py-4 whitespace-nowrap text-sm"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                statement.status === 'pending_review'
                                  ? `/statements/${statement.id}/preview`
                                  : `/statements/${statement.id}`,
                              )
                            }
                            className="mr-3 font-medium text-blue-700"
                          >
                            Preview
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
                            className="mr-3 font-medium text-blue-700 disabled:text-gray-400"
                          >
                            {downloading === statement.id ? 'Downloading…' : 'Download'}
                          </button>
                          <button
                            onClick={() => openDeleteDialog(statement.id, statement.file_name)}
                            className="text-red-600 hover:text-red-800 font-medium transition-colors"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
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
