'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { apiGet, getErrorMessage } from '@/lib/api';
import { DashboardSkeleton } from '@/components/Skeleton';

interface User {
  id: string;
  email: string;
  name: string;
}

interface CategoryData {
  name: string;
  value: number;
}

interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
}

interface SummaryStats {
  total_income: number;
  total_expenses: number;
  transaction_count: number;
}

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#06b6d4'];

export default function DashboardPage() {
  const router = useRouter();

  const getInitialUser = (): User | null => {
    const userData = localStorage.getItem('user');
    if (!userData) return null;
    try {
      return JSON.parse(userData) as User;
    } catch {
      return null;
    }
  };

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<SummaryStats>({ total_income: 0, total_expenses: 0, transaction_count: 0 });
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);

  const fetchAnalytics = async (token: string) => {
    const results = await Promise.allSettled([
      apiGet<SummaryStats>('http://localhost:3001/api/transactions/stats/summary', token),
      apiGet<CategoryData[]>('http://localhost:3001/api/analytics/pie', token),
      apiGet<MonthlyData[]>('http://localhost:3001/api/analytics/bar', token),
    ]);

    if (results[0].status === 'fulfilled') setStats(results[0].value);
    if (results[1].status === 'fulfilled') setCategoryData(results[1].value);
    if (results[2].status === 'fulfilled') setMonthlyData(results[2].value);

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const endpoints = ['stats', 'pie chart', 'bar chart'];
        console.error(`Error fetching ${endpoints[index]}:`, getErrorMessage(result.reason));
      }
    });
  };

  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('token');

      if (!token) {
        await router.replace('/auth');
        return;
      }

      const userData = getInitialUser();
      if (!userData) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        await router.replace('/auth');
        return;
      }

      setUser(userData);
      await fetchAnalytics(token);
      setIsLoading(false);
    };

    void checkAuth();
  }, [router]);

  const handleLogout = async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setIsLoading(true);
    await router.replace('/auth');
  };

  if (isLoading || !user) {
    return <DashboardSkeleton />;
  }

  const netBalance = stats.total_income - stats.total_expenses;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Finance Analytics</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-700">Welcome, {user.name}</span>
            <Link href="/pricing" className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 transition font-semibold cursor-pointer">
              ✨ Upgrade
            </Link>
            <Link href="/settings" className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition cursor-pointer">
              Categories
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Total Income</h3>
            <p className="text-3xl font-bold text-green-600 mt-2">₹{Number(stats.total_income || 0).toFixed(2)}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Total Expenses</h3>
            <p className="text-3xl font-bold text-red-600 mt-2">₹{Number(stats.total_expenses || 0).toFixed(2)}</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Net Balance</h3>
            <p className={`text-3xl font-bold mt-2 ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              ₹{Number(netBalance || 0).toFixed(2)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Quick Links</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              href="/statements"
              className="p-4 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition cursor-pointer"
            >
              <h3 className="font-semibold text-indigo-600">📤 Upload Statement</h3>
              <p className="text-sm text-gray-600">Upload bank statement PDF/Excel</p>
            </Link>
            <Link
              href="/transactions"
              className="p-4 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition cursor-pointer"
            >
              <h3 className="font-semibold text-indigo-600">📋 View Transactions</h3>
              <p className="text-sm text-gray-600">View and manage transactions</p>
            </Link>
            <Link
              href="/pricing"
              className="p-4 border border-blue-400 rounded-lg hover:bg-blue-50 transition bg-blue-50/50 cursor-pointer"
            >
              <h3 className="font-semibold text-blue-600">✨ Premium Features</h3>
              <p className="text-sm text-gray-600">Unlock advanced analytics & AI insights</p>
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Analytics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex justify-center items-center h-80">
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ₹${value}`} outerRadius={80} fill="#8884d8" dataKey="value">
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => `₹${Number(value).toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500">No expense data available</p>
              )}
            </div>
            <div className="flex justify-center items-center h-80">
              {monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip formatter={(value) => `₹${Number(value).toFixed(2)}`} />
                    <Legend />
                    <Bar dataKey="income" fill="#10b981" name="Income" />
                    <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-gray-500">No monthly data available</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
