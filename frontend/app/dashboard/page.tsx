'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import { apiGet, getErrorMessage } from '@/lib/api';
import { subscribeFinanceChanges } from '@/lib/financeRefresh';
import { DashboardSkeleton } from '@/components/Skeleton';
import { useUserPreferences } from '@/lib/date';
import { useTranslation } from '@/lib/translations';

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

  const handleLogout = (): void => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setIsLoading(true);
    window.location.replace('/auth');
  };

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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_48%,#f8fafc_100%)]">
      <AuthSessionGuard />
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/85 shadow-sm backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 text-white shadow-lg text-lg">
              📈
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
                Finlytix
              </p>
              <h1 className="text-2xl font-bold text-gray-900">Finance Analytics</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/settings?tab=profile"
              aria-label="My Profile & Account"
              title="Personal profile, phone, security & credentials"
              className="inline-flex items-center gap-2.5 rounded-full border border-blue-200/80 bg-blue-50/80 py-1.5 pr-4 pl-1.5 text-sm font-medium text-blue-900 shadow-2xs transition-all hover:bg-blue-100/80 hover:shadow-xs active:scale-98 cursor-pointer"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-2xs">
                {user.name?.trim().charAt(0).toUpperCase() || 'U'}
              </span>
              <span>{user.name}</span>
              <span className="rounded-full bg-blue-200/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-800">
                {t('profile', 'Profile')}
              </span>
            </Link>
            {user.role === 'admin' && (
              <Link
                href="/admin"
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 cursor-pointer"
              >
                Admin
              </Link>
            )}
            <Link
              href="/activity"
              title="Audit trail and account security activity logs"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-slate-900 active:scale-98 cursor-pointer"
            >
              <span>📋</span>
              <span className="hidden sm:inline">{t('activity', 'Activity')}</span>
            </Link>
            <button
              onClick={handleLogout}
              className="rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 cursor-pointer"
            >
              {t('logout', 'Logout')}
            </button>
          </div>
        </div>
      </header>

      {user && (!user.phone || user.needsPhone) && (
        <div className="mx-auto max-w-7xl px-4 pt-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div>
                <p className="text-sm font-semibold">Complete your profile</p>
                <p className="mt-0.5 text-xs text-amber-800">
                  A mobile number with country code is required for your account. Please update your
                  profile to keep your contact details up to date.
                </p>
              </div>
            </div>
            <Link
              href="/settings?tab=profile"
              className="self-start rounded-xl bg-amber-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow transition hover:bg-amber-800 cursor-pointer sm:self-center"
            >
              Add mobile number
            </Link>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 py-8">
        <section className="mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-6 text-white shadow-2xl sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">
                  Finlytix Hub
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
                  <span>⚡</span>
                  <span>
                    {prefs.currency} ({t('liveRatesActive', 'Live Rates Active')})
                  </span>
                </span>
              </div>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Your financial picture, beautifully organized.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
                Track cash flow, spending categories, and monthly movement from one polished
                dashboard.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/statements"
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg transition hover:bg-blue-50 cursor-pointer"
                >
                  {t('uploadStatement', 'Upload Statement')}
                </Link>
                <Link
                  href="/transactions"
                  className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20 cursor-pointer"
                >
                  {t('transactions', 'Review Transactions')}
                </Link>
              </div>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
              <p className="text-sm text-blue-100">{t('netBalance', 'Net Balance')}</p>
              <p
                className={`mt-2 text-4xl font-bold ${netBalance >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
              >
                {formatCurrency(netBalance)}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/10 p-3">
                  <p className="text-blue-100">{t('savingsRate', 'Savings Rate')}</p>
                  <p className="mt-1 text-xl font-bold">{savingsRate}%</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  <p className="text-blue-100">{t('transactions', 'Transactions')}</p>
                  <p className="mt-1 text-xl font-bold">{totalTransactions}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="group rounded-3xl border border-emerald-100 bg-white/90 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-600">
                {t('totalIncome', 'Total Income')}
              </h3>
              <span className="rounded-2xl bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                Credit
              </span>
            </div>
            <p className="text-3xl font-bold text-emerald-600">{formatCurrency(totalIncome)}</p>
            <p className="mt-3 text-sm text-gray-500">Money received across all imported data.</p>
          </div>
          <div className="group rounded-3xl border border-red-100 bg-white/90 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-600">
                {t('totalExpenses', 'Total Expenses')}
              </h3>
              <span className="rounded-2xl bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                Debit
              </span>
            </div>
            <p className="text-3xl font-bold text-red-600">{formatCurrency(totalExpenses)}</p>
            <p className="mt-3 text-sm text-gray-500">Spending tracked from uploaded statements.</p>
          </div>
          <div className="group rounded-3xl border border-indigo-100 bg-white/90 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-600">
                {t('netBalance', 'Net Balance')}
              </h3>
              <span className="rounded-2xl bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                {netBalance >= 0 ? 'Positive' : 'Negative'}
              </span>
            </div>
            <p
              className={`text-3xl font-bold ${netBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
            >
              {formatCurrency(netBalance)}
            </p>
            <p className="mt-3 text-sm text-gray-500">Top category: {topCategory}</p>
          </div>
        </div>

        <div className="bg-white/90 rounded-3xl border border-white p-6 shadow-sm mb-8">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
                Shortcuts
              </p>
              <h2 className="text-2xl font-bold text-gray-900">What would you like to do?</h2>
            </div>
            <p className="text-sm text-gray-500">Fast access to your most-used workflows.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/statements"
              className="group rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 transition hover:-translate-y-1 hover:border-indigo-300 hover:shadow-xl cursor-pointer"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600 text-xl text-white shadow-lg">
                📤
              </div>
              <h3 className="font-semibold text-indigo-700">
                {t('uploadStatement', 'Upload Statement')}
              </h3>
              <p className="mt-2 text-sm text-gray-600">Import verified PDF or XLSX statements.</p>
            </Link>
            <Link
              href="/transactions"
              className="group rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl cursor-pointer"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white shadow-lg">
                📋
              </div>
              <h3 className="font-semibold text-blue-700">
                {t('transactions', 'View Transactions')}
              </h3>
              <p className="mt-2 text-sm text-gray-600">Search, review, and tune categories.</p>
            </Link>
            <Link
              href="/analytics"
              className="group rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-xl cursor-pointer"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-xl text-white shadow-lg">
                📊
              </div>
              <h3 className="font-semibold text-emerald-700">
                {t('analytics', 'Analytics Studio')}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Explore month, FY, and custom date insights.
              </p>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
