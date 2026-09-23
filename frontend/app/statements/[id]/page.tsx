'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import BackButton from '@/components/BackButton';
import { apiGet, getErrorMessage } from '@/lib/api';
import { formatDate, formatMonthYear, useUserPreferences } from '@/lib/date';
import { useTranslation } from '@/lib/translations';
import StatementProcessingProgress, {
  isStatementProcessing,
} from '@/components/StatementProcessingProgress';

interface Statement {
  id: string;
  bank_name: string;
  file_name: string;
  uploaded_at: string;
  status: string;
  statement_month?: string | null;
  file_format?: string | null;
  processing_stage?: string | null;
  processing_progress?: number | null;
  processing_error?: string | null;
  processed_at?: string | null;
}

interface Transaction {
  id: string;
  date: string;
  amount: number | string;
  description: string;
  type: string;
  category_id?: string;
}

export default function StatementDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { t } = useTranslation();
  const prefs = useUserPreferences();
  const [statement, setStatement] = useState<Statement | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchStatementDetails = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const data = await apiGet<{ statement: Statement; transactions: Transaction[] }>(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/upload/${params.id}`,
        token ?? undefined,
      );

      setStatement(data.statement);
      setTransactions(data.transactions);
      setError('');
    } catch (err) {
      setError('Failed to load statement details');
      console.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth');
      return;
    }

    void Promise.resolve().then(fetchStatementDetails);
  }, [fetchStatementDetails, router]);

  useEffect(() => {
    if (!statement || !isStatementProcessing(statement)) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void fetchStatementDetails();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [fetchStatementDetails, statement]);

  useEffect(() => {
    if (statement && statement.status === 'pending_review') {
      router.replace(`/statements/${statement.id}/preview`);
    }
  }, [statement, router]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-600">{error}</div>
    );
  }

  if (!statement) {
    return <div className="min-h-screen flex items-center justify-center">Statement not found</div>;
  }

  if (statement.status === 'pending_review') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-6 shadow-md text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 text-xl mb-4">
            ⏳
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Pending Review</h2>
          <p className="text-sm text-gray-600 mb-6">
            This statement draft is awaiting confirmation. Transactions will appear here once
            approved.
          </p>
          <button
            onClick={() => router.push(`/statements/${statement.id}/preview`)}
            className="w-full bg-blue-600 text-white py-2.5 px-4 rounded-xl font-medium hover:bg-blue-700 transition cursor-pointer"
          >
            Review and Confirm Import
          </button>
        </div>
      </div>
    );
  }

  const totalDebit = transactions
    .filter((t) => t.type === 'debit')
    .reduce((sum, t) => sum + Number(t.amount), 0);
  const totalCredit = transactions
    .filter((t) => t.type === 'credit')
    .reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <AuthSessionGuard />
      <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <BackButton fallbackHref="/statements" label="Back to Statements" className="mb-6" />

        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{statement.bank_name}</h1>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                File Name
              </p>
              <p
                className="text-sm font-semibold text-gray-900 truncate"
                title={statement.file_name}
              >
                {statement.file_name}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Period
              </p>
              <p className="text-sm font-semibold text-gray-900">
                {formatMonthYear(statement.statement_month)}
              </p>
              {statement.statement_month && (
                <p className="text-xs text-gray-400">{statement.statement_month}</p>
              )}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Format
              </p>
              <div>
                <span
                  className={`inline-flex items-center rounded px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                    (statement.file_format?.toUpperCase() ||
                      (statement.file_name.endsWith('.xlsx') ? 'XLSX' : 'PDF')) === 'PDF'
                      ? 'border border-red-200 bg-red-50 text-red-700'
                      : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  {statement.file_format?.toUpperCase() ||
                    (statement.file_name.endsWith('.xlsx') ? 'XLSX' : 'PDF')}
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Status
              </p>
              <p className="text-sm font-medium">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                    statement.status === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : statement.status === 'processing'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                  }`}
                >
                  {statement.status}
                </span>
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Uploaded
              </p>
              <p className="text-sm font-medium text-gray-900">
                {formatDate(statement.uploaded_at)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                Transactions
              </p>
              <p className="text-sm font-semibold text-gray-900">{transactions.length}</p>
            </div>
          </div>
          {statement.status !== 'completed' && (
            <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <p className="mb-3 text-sm font-medium text-gray-700">Processing Timeline</p>
              <StatementProcessingProgress statement={statement} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-2">{t('transactions', 'Total Transactions')}</p>
            <p className="text-3xl font-bold text-blue-600">{transactions.length}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-2">
              {t('totalIncome', 'Total Credits (Income)')}
            </p>
            <p className="text-3xl font-bold text-green-600">{prefs.formatMoney(totalCredit)}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-2">
              {t('totalExpenses', 'Total Debits (Expenses)')}
            </p>
            <p className="text-3xl font-bold text-red-600">{prefs.formatMoney(totalDebit)}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              {t('transactions', 'Transactions')}
            </h2>
          </div>

          {transactions.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              {isStatementProcessing(statement)
                ? 'Transactions will appear here after processing completes.'
                : 'No transactions found'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      {t('date', 'Date')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      {t('description', 'Description')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                      {t('type', 'Type')}
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                      {t('amount', 'Amount')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.map((txn) => (
                    <tr key={txn.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(txn.date)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                        {txn.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            txn.type === 'credit'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {txn.type.charAt(0).toUpperCase() + txn.type.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                        {txn.type === 'credit' ? '+' : '-'} {prefs.formatMoney(txn.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
