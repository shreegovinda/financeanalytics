'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      router.push('/dashboard');
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <header className="bg-white shadow-sm dark:bg-gray-800">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            💰 Finance Analytics
          </h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
              Take Control of Your Finances
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
              Upload your bank statements from ICICI, HDFC, and Axis banks. Our AI automatically categorizes your transactions and provides insights into your spending patterns.
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📊</span>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Smart Analytics</h3>
                  <p className="text-gray-600 dark:text-gray-400">View your spending breakdown by category with interactive charts</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">🤖</span>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">AI-Powered Categorization</h3>
                  <p className="text-gray-600 dark:text-gray-400">Claude AI automatically categorizes transactions with high accuracy</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">📈</span>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">Monthly Trends</h3>
                  <p className="text-gray-600 dark:text-gray-400">Track your income and expenses over time to identify patterns</p>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <Link
                href="/auth"
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
              >
                Get Started
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-8 dark:bg-gray-800">
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg p-6 text-white">
                <div className="text-3xl font-bold mb-2">₹50,000</div>
                <div className="text-sm opacity-90">Total Spent This Month</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Expenses</div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">₹45,000</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <div className="text-sm text-gray-600 dark:text-gray-400">Income</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">₹1,00,000</div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Food & Dining</span>
                  <span className="font-semibold text-gray-900 dark:text-white">₹8,500</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Transport</span>
                  <span className="font-semibold text-gray-900 dark:text-white">₹3,200</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">Shopping</span>
                  <span className="font-semibold text-gray-900 dark:text-white">₹12,000</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
