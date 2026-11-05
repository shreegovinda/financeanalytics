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
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-brand-100">
      <header className="bg-surface shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-ink">💰 Finance Analytics</h1>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-20">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-5xl font-bold text-ink mb-6">Take Control of Your Finances</h2>
            <p className="text-xl text-ink-2 mb-8">
              Upload your bank statements from ICICI and SBI. Our AI automatically categorizes your
              transactions and provides insights into your spending patterns.
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📊</span>
                <div>
                  <h3 className="font-semibold text-ink">Smart Analytics</h3>
                  <p className="text-ink-2">
                    View your spending breakdown by category with interactive charts
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">🤖</span>
                <div>
                  <h3 className="font-semibold text-ink">AI-Powered Categorization</h3>
                  <p className="text-ink-2">
                    Choose Claude or Gemini to automatically categorize transactions with high
                    accuracy
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-2xl">📈</span>
                <div>
                  <h3 className="font-semibold text-ink">Monthly Trends</h3>
                  <p className="text-ink-2">
                    Track your income and expenses over time to identify patterns
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <Link
                href="/auth"
                className="px-8 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition font-semibold"
              >
                Get Started
              </Link>
              <Link href="/help" className="mt-4 block text-sm text-white/70 underline">
                Help, privacy and security FAQs
              </Link>
            </div>
          </div>

          <div className="bg-surface rounded-lg shadow-lg p-8">
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-brand-400 to-brand-600 rounded-lg p-6 text-white">
                <div className="text-3xl font-bold mb-2">₹50,000</div>
                <div className="text-sm opacity-90">Total Spent This Month</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg">
                  <div className="text-sm text-ink-2">Expenses</div>
                  <div className="text-2xl font-bold text-red-600 dark:text-red-400">₹45,000</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
                  <div className="text-sm text-ink-2">Income</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    ₹1,00,000
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-4 border-t">
                <div className="flex justify-between">
                  <span className="text-ink-2">Food & Dining</span>
                  <span className="font-semibold text-ink">₹8,500</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">Transport</span>
                  <span className="font-semibold text-ink">₹3,200</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">Shopping</span>
                  <span className="font-semibold text-ink">₹12,000</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
