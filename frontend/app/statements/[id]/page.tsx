'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiGet, getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/date';

interface Statement {
  id: string;
  bank_name: string;
  file_name: string;
  uploaded_at: string;
  status: string;
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

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (error) {
    return <div className="min-h-screen flex items-center justify-center text-red-600">{error}</div>;
  }

  if (!statement) {
    return <div className="min-h-screen flex items-center justify-center">Statement not found</div>;
  }

  const totalDebit = transactions.filter((t) => t.type === 'debit').reduce((sum, t) => sum + Number(t.amount), 0);
  const totalCredit = transactions.filter((t) => t.type === 'credit').reduce((sum, t) => sum + Number(t.amount), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <button onClick={() => router.push('/statements')} className="text-blue-600 hover:text-blue-800 mb-6 flex items-center gap-2 cursor-pointer">
          ← Back to Statements
        </button>

        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">{statement.bank_name}</h1>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-600">File Name</p>
              <p className="text-lg font-medium text-gray-900">{statement.file_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Status</p>
              <p className="text-lg font-medium">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-medium ${
                    statement.status === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : statement.status === 'processing'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                  }`}
                >
                  {statement.status.charAt(0).toUpperCase() + statement.status.slice(1)}
                </span>
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Uploaded</p>
              <p className="text-lg font-medium text-gray-900">{formatDate(statement.uploaded_at)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Transactions</p>
              <p className="text-lg font-medium text-gray-900">{transactions.length}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-2">Total Transactions</p>
            <p className="text-3xl font-bold text-blue-600">{transactions.length}</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-2">Total Credits (Income)</p>
            <p className="text-3xl font-bold text-green-600">₹{totalCredit.toFixed(2)}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <p className="text-sm text-gray-600 mb-2">Total Debits (Expenses)</p>
            <p className="text-3xl font-bold text-red-600">₹{totalDebit.toFixed(2)}</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Transactions</h2>
          </div>

          {transactions.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">No transactions found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.map((txn) => (
                    <tr key={txn.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDate(txn.date)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{txn.description}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            txn.type === 'credit' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {txn.type.charAt(0).toUpperCase() + txn.type.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                        {txn.type === 'credit' ? '+' : '-'}₹{Number(txn.amount).toFixed(2)}
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
