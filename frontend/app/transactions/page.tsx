'use client';

import { useCallback, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiGet, apiPut, getErrorMessage } from '@/lib/api';
import { formatDate, parseDisplayDateToIso } from '@/lib/date';
import { CardGridSkeleton, TableSkeletonLoader } from '@/components/Skeleton';

interface Transaction {
  id: string;
  date: string;
  amount: number | string;
  description: string;
  type: string;
  category_id?: string;
  ai_suggested_category?: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
  is_default: boolean;
}

interface Stats {
  total_income: number | string;
  total_expenses: number | string;
  transaction_count: number;
}

export default function TransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const query = new URLSearchParams({ limit: '1000' });
      const startDateParam = parseDisplayDateToIso(startDate);
      const endDateParam = parseDisplayDateToIso(endDate);

      if (startDateParam) query.set('startDate', startDateParam);
      if (endDateParam) query.set('endDate', endDateParam);

      const [txnData, statsData, catData] = await Promise.all([
        apiGet<Transaction[]>(`${apiUrl}/api/transactions?${query.toString()}`, token ?? undefined),
        apiGet<Stats>(`${apiUrl}/api/transactions/stats/summary`, token ?? undefined),
        apiGet<Category[]>(`${apiUrl}/api/categories`, token ?? undefined),
      ]);

      setTransactions(txnData);
      setStats(statsData);
      setCategories(catData);
      setError('');
    } catch (err) {
      setError('Failed to load transactions');
      console.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth');
      return;
    }

    void Promise.resolve().then(fetchData);
  }, [fetchData, router]);

  const handleUpdateCategory = async (txnId: string, categoryId: string) => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

      await apiPut(`${apiUrl}/api/transactions/${txnId}`, { categoryId }, token ?? undefined);

      setTransactions(transactions.map((t) => (t.id === txnId ? { ...t, category_id: categoryId } : t)));
      setEditingTxnId(null);
      setSelectedCategory('');
    } catch (err) {
      setError('Failed to update category');
      console.error(getErrorMessage(err));
    }
  };

  const getCategoryName = (txn: Transaction): string => {
    if (txn.category_id) {
      const cat = categories.find((c) => c.id === txn.category_id);
      return cat?.name || 'Unknown';
    }
    return txn.ai_suggested_category || 'Uncategorized';
  };

  const getCategoryColor = (txn: Transaction): string => {
    if (txn.category_id) {
      const cat = categories.find((c) => c.id === txn.category_id);
      return cat?.color || '#6b7280';
    }
    return '#6b7280';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Transactions</h1>
          <div className="flex gap-2">
            <Link href="/settings" className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition cursor-pointer">
              Manage Categories
            </Link>
            <Link href="/dashboard" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <p className="text-gray-600">View and manage all your transactions</p>
        </div>

        {loading ? (
          <CardGridSkeleton count={3} />
        ) : (
          stats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <p className="text-sm text-gray-600 mb-2">Total Income</p>
                <p className="text-3xl font-bold text-green-600">₹{(Number(stats.total_income) || 0).toFixed(2)}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <p className="text-sm text-gray-600 mb-2">Total Expenses</p>
                <p className="text-3xl font-bold text-red-600">₹{(Number(stats.total_expenses) || 0).toFixed(2)}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <p className="text-sm text-gray-600 mb-2">Total Transactions</p>
                <p className="text-3xl font-bold text-blue-600">{stats.transaction_count}</p>
              </div>
            </div>
          )
        )}

        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Filters</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="dd/mm/yyyy"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="dd/mm/yyyy"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <TableSkeletonLoader rows={8} />
        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
            </div>

            {error ? (
            <div className="px-6 py-8 bg-red-50 text-red-700">{error}</div>
          ) : transactions.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No transactions found. <Link href="/statements" className="text-blue-600 hover:text-blue-800">Upload a statement</Link> to get started!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Description</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {transactions.map((txn) => (
                    <tr key={txn.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDate(txn.date)}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">{txn.description}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {editingTxnId === txn.id ? (
                          <select
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                          >
                            <option value="">-- Select --</option>
                            {categories.map((cat) => (
                              <option key={cat.id} value={cat.id}>
                                {cat.name}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: getCategoryColor(txn) }}
                            />
                            <span className="text-sm text-gray-900">{getCategoryName(txn)}</span>
                          </div>
                        )}
                      </td>
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
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {editingTxnId === txn.id ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleUpdateCategory(txn.id, selectedCategory)}
                              className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingTxnId(null)}
                              className="px-2 py-1 bg-gray-400 text-white text-xs rounded hover:bg-gray-500 cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingTxnId(txn.id);
                              setSelectedCategory(txn.category_id || '');
                            }}
                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 cursor-pointer"
                          >
                            Edit
                          </button>
                        )}
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
