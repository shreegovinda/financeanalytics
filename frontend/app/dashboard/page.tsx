'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import AiProviderSelect from '@/components/AiProviderSelect';
import { apiGet, apiPut, getErrorMessage } from '@/lib/api';
import { DashboardSkeleton } from '@/components/Skeleton';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
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

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<SummaryStats>({
    total_income: 0,
    total_expenses: 0,
    transaction_count: 0,
  });
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);

  const fetchAnalytics = async (token: string) => {
    const results = await Promise.allSettled([
      apiGet<SummaryStats>('http://localhost:3001/api/transactions/stats/summary', token),
      apiGet<CategoryData[]>('http://localhost:3001/api/analytics/pie', token),
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
      setIsLoading(false);
    };

    void checkAuth();
  }, [router]);

  const handleLogout = (): void => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setIsLoading(true);
    window.location.replace('/auth');
  };

  const openProfile = (): void => {
    if (!user) return;
    setProfileName(user.name || '');
    setProfilePhone(user.phone || '');
    setProfileError('');
    setProfileSuccess('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmNewPassword('');
    setPasswordError('');
    setPasswordSuccess('');
    setShowPasswordForm(false);
    setIsProfileOpen(true);
  };

  const handleProfileSave = async (): Promise<void> => {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.replace('/auth');
      return;
    }

    if (!user || (profileName.trim() === user.name && profilePhone.trim() === (user.phone || ''))) {
      return;
    }

    setIsSavingProfile(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      const response = await apiPut<{ user: User }>(
        `${API_BASE_URL}/api/auth/me`,
        { name: profileName, phone: profilePhone },
        token,
      );
      localStorage.setItem('user', JSON.stringify(response.user));
      setUser(response.user);
      setProfileSuccess('Profile updated successfully.');
    } catch (err) {
      setProfileError(getErrorMessage(err));
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSave = async (): Promise<void> => {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.replace('/auth');
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    setIsSavingPassword(true);
    setPasswordError('');
    setPasswordSuccess('');

    try {
      const response = await apiPut<{ success: boolean; token: string }>(
        `${API_BASE_URL}/api/auth/password`,
        { currentPassword, newPassword },
        token,
      );
      localStorage.setItem('token', response.token);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordSuccess('Password updated successfully.');
      setShowPasswordForm(false);
    } catch (err) {
      setPasswordError(getErrorMessage(err));
    } finally {
      setIsSavingPassword(false);
    }
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
  const formatCurrency = (value: number): string => `₹${Number(value || 0).toFixed(2)}`;
  const hasProfileChanges =
    profileName.trim() !== user.name || profilePhone.trim() !== (user.phone || '');
  const canSavePassword =
    currentPassword.length > 0 && newPassword.length > 0 && confirmNewPassword.length > 0;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_48%,#f8fafc_100%)]">
      <AuthSessionGuard />
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/85 shadow-sm backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-center">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white shadow-lg">
              ₹
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
                Finlytix
              </p>
              <h1 className="text-2xl font-bold text-gray-900">Finance Analytics</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800">
              Welcome, {user.name}
            </span>
            <button
              type="button"
              onClick={openProfile}
              aria-label="Edit profile"
              className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 transition flex items-center justify-center font-semibold cursor-pointer"
            >
              {user.name?.trim().charAt(0).toUpperCase() || 'U'}
            </button>
            <Link
              href="/settings"
              className="px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              Categories
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-white text-red-600 rounded-xl border border-red-200 hover:bg-red-50 transition cursor-pointer"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <section className="mb-8 overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 p-6 text-white shadow-2xl sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[1.25fr_0.75fr] lg:items-center">
            <div>
              <p className="mb-3 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">
                Money Command Center
              </p>
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
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg transition hover:bg-blue-50"
                >
                  Upload Statement
                </Link>
                <Link
                  href="/transactions"
                  className="rounded-2xl border border-white/20 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
                >
                  Review Transactions
                </Link>
              </div>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
              <p className="text-sm text-blue-100">Net Balance</p>
              <p
                className={`mt-2 text-4xl font-bold ${netBalance >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
              >
                {formatCurrency(netBalance)}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white/10 p-3">
                  <p className="text-blue-100">Savings Rate</p>
                  <p className="mt-1 text-xl font-bold">{savingsRate}%</p>
                </div>
                <div className="rounded-2xl bg-white/10 p-3">
                  <p className="text-blue-100">Transactions</p>
                  <p className="mt-1 text-xl font-bold">{totalTransactions}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="group rounded-3xl border border-emerald-100 bg-white/90 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-600">Total Income</h3>
              <span className="rounded-2xl bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                Credit
              </span>
            </div>
            <p className="text-3xl font-bold text-emerald-600">{formatCurrency(totalIncome)}</p>
            <p className="mt-3 text-sm text-gray-500">Money received across all imported data.</p>
          </div>
          <div className="group rounded-3xl border border-red-100 bg-white/90 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-600">Total Expenses</h3>
              <span className="rounded-2xl bg-red-50 px-3 py-1 text-xs font-bold text-red-700">
                Debit
              </span>
            </div>
            <p className="text-3xl font-bold text-red-600">{formatCurrency(totalExpenses)}</p>
            <p className="mt-3 text-sm text-gray-500">Spending tracked from uploaded statements.</p>
          </div>
          <div className="group rounded-3xl border border-indigo-100 bg-white/90 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-600">Net Balance</h3>
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
              <h3 className="font-semibold text-indigo-700">Upload Statement</h3>
              <p className="mt-2 text-sm text-gray-600">Import verified PDF or XLSX statements.</p>
            </Link>
            <Link
              href="/transactions"
              className="group rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5 transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-xl cursor-pointer"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-xl text-white shadow-lg">
                📋
              </div>
              <h3 className="font-semibold text-blue-700">View Transactions</h3>
              <p className="mt-2 text-sm text-gray-600">Search, review, and tune categories.</p>
            </Link>
            <Link
              href="/analytics"
              className="group rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5 transition hover:-translate-y-1 hover:border-emerald-300 hover:shadow-xl cursor-pointer"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-xl text-white shadow-lg">
                📊
              </div>
              <h3 className="font-semibold text-emerald-700">Analytics Studio</h3>
              <p className="mt-2 text-sm text-gray-600">
                Explore month, FY, and custom date insights.
              </p>
            </Link>
          </div>
        </div>
      </main>

      {isProfileOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 px-4 py-6 backdrop-blur-sm sm:py-10">
          <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl">
            <div className="relative bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 px-6 py-6 text-white">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.22),transparent_32%)]" />
              <div className="relative flex items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-2xl font-bold shadow-lg">
                    {user.name?.trim().charAt(0).toUpperCase() || 'U'}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-100">Account settings</p>
                    <h2 className="text-2xl font-bold">{user.name || 'Your Profile'}</h2>
                    <p className="mt-1 text-sm text-blue-100">{user.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsProfileOpen(false)}
                  className="rounded-full bg-white/10 px-3 py-1.5 text-sm text-white hover:bg-white/20 cursor-pointer"
                  aria-label="Close profile editor"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[calc(100vh-12rem)] overflow-y-auto px-6 py-6">
              {profileError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  {profileSuccess}
                </div>
              )}
              {passwordError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {passwordError}
                </div>
              )}
              {passwordSuccess && (
                <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  {passwordSuccess}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    Profile
                  </p>
                  <p className="mt-2 text-sm text-blue-950">Manage your name and contact number.</p>
                </div>
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                    AI Model
                  </p>
                  <p className="mt-2 text-sm text-indigo-950">Choose the model used for parsing.</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                    Security
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    Password settings stay hidden by default.
                  </p>
                </div>
              </div>

              <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Personal details</h3>
                  <p className="text-sm text-gray-500">Keep your profile information up to date.</p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Name</span>
                    <input
                      type="text"
                      value={profileName}
                      onChange={(event) => setProfileName(event.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Phone</span>
                    <input
                      type="tel"
                      value={profilePhone}
                      onChange={(event) => setProfilePhone(event.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="mb-1 block text-sm font-medium text-gray-700">Email</span>
                    <input
                      type="email"
                      value={user.email}
                      disabled
                      className="w-full cursor-not-allowed rounded-xl border border-gray-200 bg-gray-100 px-3 py-2.5 text-gray-500"
                    />
                    <span className="mt-1 block text-xs text-gray-500">
                      Email cannot be changed.
                    </span>
                  </label>
                </div>

                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setIsProfileOpen(false)}
                    className="rounded-xl border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleProfileSave()}
                    disabled={isSavingProfile || !hasProfileChanges}
                    className="rounded-xl bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
                  >
                    {isSavingProfile ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </section>

              <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">AI preferences</h3>
                  <p className="text-sm text-gray-500">
                    Select the model used for statement parsing and categorization.
                  </p>
                </div>
                <AiProviderSelect embedded />
              </section>

              <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Security</h3>
                    <p className="text-sm text-gray-500">
                      Update your password only when you need to rotate it.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordForm((current) => !current);
                      setPasswordError('');
                      setPasswordSuccess('');
                    }}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    {showPasswordForm ? 'Hide Password Form' : 'Change Password'}
                  </button>
                </div>

                {showPasswordForm && (
                  <div className="mt-5 space-y-4 rounded-2xl bg-slate-50 p-4">
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">
                        Current Password
                      </span>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(event) => setCurrentPassword(event.target.value)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">
                        New Password
                      </span>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(event) => setNewPassword(event.target.value)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-700">
                        Confirm New Password
                      </span>
                      <input
                        type="password"
                        value={confirmNewPassword}
                        onChange={(event) => setConfirmNewPassword(event.target.value)}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => void handlePasswordSave()}
                        disabled={isSavingPassword || !canSavePassword}
                        className="rounded-xl bg-gray-900 px-4 py-2 text-white hover:bg-gray-800 disabled:opacity-60 cursor-pointer"
                      >
                        {isSavingPassword ? 'Updating...' : 'Update Password'}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
