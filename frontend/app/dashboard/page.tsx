'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface User {
  id: string;
  email: string;
  name: string;
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');

    if (!token) {
      router.push('/login');
      return;
    }

    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/login');
  };

  if (!user) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Finance Analytics</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-700">Welcome, {user.name}</span>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Total Income</h3>
            <p className="text-3xl font-bold text-green-600 mt-2">₹0</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Total Expenses</h3>
            <p className="text-3xl font-bold text-red-600 mt-2">₹0</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-gray-600 text-sm font-medium">Net Balance</h3>
            <p className="text-3xl font-bold text-blue-600 mt-2">₹0</p>
          </div>
        </div>

        {/* Navigation */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Quick Links</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              href="/statements"
              className="p-4 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition"
            >
              <h3 className="font-semibold text-indigo-600">📤 Upload Statement</h3>
              <p className="text-sm text-gray-600">Upload bank statement PDF/Excel</p>
            </Link>
            <Link
              href="/transactions"
              className="p-4 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition"
            >
              <h3 className="font-semibold text-indigo-600">📋 View Transactions</h3>
              <p className="text-sm text-gray-600">View and manage transactions</p>
            </Link>
          </div>
        </div>

        {/* Placeholder for Charts */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Analytics</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="border border-gray-200 rounded-lg p-4 flex items-center justify-center h-64">
              <p className="text-gray-500">Pie Chart (Coming soon...)</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-4 flex items-center justify-center h-64">
              <p className="text-gray-500">Bar Chart (Coming soon...)</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
