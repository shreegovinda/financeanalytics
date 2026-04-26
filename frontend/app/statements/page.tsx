'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import BackButton from '@/components/BackButton';
import FileUploadForm from '@/components/FileUploadForm';
import { apiGet, getErrorMessage } from '@/lib/api';
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
}

export default function StatementsPage() {
  const router = useRouter();
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const handleUploadSuccess = () => {
    void fetchStatements();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AuthSessionGuard />
      <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <BackButton className="mb-6 shadow-sm" />

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Bank Statements</h1>
          <p className="text-gray-600">Upload and manage your bank statements</p>
        </div>

        <div className="bg-white rounded-lg shadow-md p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Upload New Statement</h2>
          <FileUploadForm onUploadSuccess={handleUploadSuccess} />
        </div>

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
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {statements.map((statement) => (
                      <tr
                        key={statement.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => router.push(`/statements/${statement.id}`)}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {statement.bank_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {statement.file_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-3 py-1 rounded-full text-xs font-medium ${
                              statement.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : statement.status === 'processing'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {statement.status.charAt(0).toUpperCase() + statement.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 min-w-72">
                          <StatementProcessingProgress statement={statement} />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatDate(statement.uploaded_at)}
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
    </div>
  );
}
