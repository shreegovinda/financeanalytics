'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import AuthSessionGuard from '@/components/AuthSessionGuard';
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

const COLORS = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6366f1',
  '#06b6d4',
];

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
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
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
      await apiPut<{ success: boolean }>(
        `${API_BASE_URL}/api/auth/password`,
        { currentPassword, newPassword },
        token,
      );
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setPasswordSuccess('Password updated successfully.');
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
  const hasProfileChanges =
    profileName.trim() !== user.name || profilePhone.trim() !== (user.phone || '');
  const canSavePassword =
    currentPassword.length > 0 && newPassword.length > 0 && confirmNewPassword.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <AuthSessionGuard />
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-800">Finance Analytics</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-gray-700">Welcome, {user.name}</span>
            <button
              type="button"
              onClick={openProfile}
              aria-label="Edit profile"
              className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 transition flex items-center justify-center font-semibold cursor-pointer"
            >
              {user.name?.trim().charAt(0).toUpperCase() || 'U'}
            </button>
            <Link
              href="/pricing"
              className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg hover:from-blue-600 hover:to-indigo-700 transition font-semibold cursor-pointer"
            >
              ✨ Upgrade
            </Link>
            <Link
              href="/settings"
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition cursor-pointer"
            >
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
            <p className="text-3xl font-bold text-green-600 mt-2">
              ₹{Number(stats.total_income || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Total Expenses</h3>
            <p className="text-3xl font-bold text-red-600 mt-2">
              ₹{Number(stats.total_expenses || 0).toFixed(2)}
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Net Balance</h3>
            <p
              className={`text-3xl font-bold mt-2 ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}
            >
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
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ₹${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
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

      {isProfileOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md border border-gray-100">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Edit Profile</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsProfileOpen(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
                aria-label="Close profile editor"
              >
                ✕
              </button>
            </div>

            {profileError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                {profileError}
              </div>
            )}
            {profileSuccess && (
              <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
                {profileSuccess}
              </div>
            )}
            {passwordError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg">
                {passwordSuccess}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(event) => setProfileName(event.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={profilePhone}
                  onChange={(event) => setProfilePhone(event.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={user.email}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-gray-500 bg-gray-100 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed.</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6 pb-6 border-b border-gray-100">
              <button
                type="button"
                onClick={() => setIsProfileOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleProfileSave()}
                disabled={isSavingProfile || !hasProfileChanges}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
              >
                {isSavingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Update Password</h3>
              <p className="text-sm text-gray-500 mb-4">
                Use this only when you want to change your password.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(event) => setConfirmNewPassword(event.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-end mt-6">
                <button
                  type="button"
                  onClick={() => void handlePasswordSave()}
                  disabled={isSavingPassword || !canSavePassword}
                  className="px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60 cursor-pointer"
                >
                  {isSavingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
