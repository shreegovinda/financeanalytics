'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import { apiGet, getErrorMessage } from '@/lib/api';
import { subscribeFinanceChanges } from '@/lib/financeRefresh';
import { DashboardSkeleton } from '@/components/Skeleton';
import { useUserPreferences } from '@/lib/date';
import { useTranslation } from '@/lib/translations';
import FinlytixHealthScore from '@/components/FinlytixHealthScore';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  needsPhone?: boolean;
  role?: string;
}

interface CategoryData {
  name: string;
  value: number;
}

interface SummaryStats {
  total_income: number;
  total_expenses: number;
  transaction_count: number;
}

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

  const prefs = useUserPreferences();
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<SummaryStats>({
    total_income: 0,
    total_expenses: 0,
    transaction_count: 0,
  });
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);

  const fetchAnalytics = async (token: string) => {
    const results = await Promise.allSettled([
      apiGet<SummaryStats>(`${API_BASE_URL}/api/transactions/stats/summary`, token),
      apiGet<CategoryData[]>(`${API_BASE_URL}/api/analytics/pie`, token),
    ]);

    if (results[0].status === 'fulfilled') setStats(results[0].value);
    if (results[1].status === 'fulfilled') setCategoryData(results[1].value);

    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const endpoints = ['stats', 'pie chart'];
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
      try {
        const profileRes = await apiGet<{ user: User }>(`${API_BASE_URL}/api/auth/me`, token);
        if (profileRes?.user) {
          setUser(profileRes.user);
          localStorage.setItem('user', JSON.stringify(profileRes.user));
        }
      } catch {
        // Fall back to stored session user
      }
      setIsLoading(false);
    };

    void checkAuth();
    return subscribeFinanceChanges(() => void checkAuth());
  }, [router]);

  if (isLoading || !user) {
    return <DashboardSkeleton />;
  }

  const netBalance = stats.total_income - stats.total_expenses;
  const totalIncome = Number(stats.total_income || 0);
  const totalExpenses = Number(stats.total_expenses || 0);
  const totalTransactions = Number(stats.transaction_count || 0);
  const savingsRate =
    totalIncome > 0 ? Math.max(0, Math.round((netBalance / totalIncome) * 100)) : 0;
  const topCategory = categoryData[0]?.name || 'No category yet';
  const formatCurrency = (value: number): string => prefs.formatMoney(value);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, staggerChildren: 0.1 }}
      className="space-y-6 pb-12"
    >
      <AuthSessionGuard />

      <div className="flex flex-col gap-2 mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          Welcome back, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-slate-500 text-sm">
          Here is your financial overview. Keep tracking to meet your goals.
        </p>
      </div>

      {/* Primary KPI Stats - Bento Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Net Balance */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-lg transition-transform hover:scale-[1.02]">
          <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl"></div>
          <p className="text-sm font-medium text-brand-100 uppercase tracking-wider">
            {t('netBalance', 'Net Balance')}
          </p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-4xl font-bold tracking-tight">{formatCurrency(netBalance)}</p>
          </div>
          <div className="mt-4 flex items-center text-xs text-brand-200">
            <span className="flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 font-medium text-white">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                />
              </svg>
              {savingsRate}% Saved
            </span>
          </div>
        </div>

        {/* Total Income */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">
              {t('totalIncome', 'Income')}
            </p>
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-900">{formatCurrency(totalIncome)}</p>
        </div>

        {/* Total Expenses */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">
              {t('totalExpenses', 'Expenses')}
            </p>
          </div>
          <p className="mt-4 text-2xl font-bold text-slate-900">{formatCurrency(totalExpenses)}</p>
        </div>

        {/* Transactions / Highest Category */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 transition-shadow hover:shadow-md">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">
              Top Category
            </p>
          </div>
          <p className="mt-4 text-xl font-bold text-slate-900 truncate" title={topCategory}>
            {topCategory}
          </p>
          <p className="mt-1 text-xs text-slate-500">{totalTransactions} total transactions</p>
        </div>
      </div>

      {/* Finlytix Health Score (FinScore) Hero Section */}
      <FinlytixHealthScore />

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Quick Actions */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-100 lg:col-span-1">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            <Link
              href="/statements"
              className="flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 p-4 transition-colors hover:bg-brand-50 hover:text-brand-700 text-slate-600"
            >
              <span className="text-2xl">📄</span>
              <span className="text-xs font-semibold">Statements</span>
            </Link>
            <Link
              href="/transactions"
              className="flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 p-4 transition-colors hover:bg-brand-50 hover:text-brand-700 text-slate-600"
            >
              <span className="text-2xl">💳</span>
              <span className="text-xs font-semibold">Transactions</span>
            </Link>
            <Link
              href="/analytics"
              className="flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 p-4 transition-colors hover:bg-brand-50 hover:text-brand-700 text-slate-600"
            >
              <span className="text-2xl">📊</span>
              <span className="text-xs font-semibold">Analytics</span>
            </Link>
            <Link
              href="/settings"
              className="flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 p-4 transition-colors hover:bg-brand-50 hover:text-brand-700 text-slate-600"
            >
              <span className="text-2xl">⚙️</span>
              <span className="text-xs font-semibold">Settings</span>
            </Link>
          </div>
        </div>

        {/* AI Assistant Promo */}
        <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 shadow-sm ring-1 ring-slate-800 lg:col-span-2 text-white relative overflow-hidden flex flex-col justify-center">
          <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-brand-500/20 to-transparent blur-3xl pointer-events-none"></div>
          <div className="relative z-10 max-w-md">
            <span className="inline-block rounded-full bg-brand-500/20 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-300 border border-brand-500/30 mb-3">
              New Feature
            </span>
            <h2 className="text-2xl font-bold mb-2">Talk to your Financial AI</h2>
            <p className="text-slate-400 text-sm mb-6 leading-relaxed">
              Ask questions about your spending, extract data from unstructured receipts, or get a
              full breakdown of your month using our new Voice and Text Assistant.
            </p>
            <Link
              href="/assistant"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition-colors hover:bg-brand-50 shadow-md"
            >
              <svg
                className="w-4 h-4 text-brand-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
              Try Voice Assistant
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
