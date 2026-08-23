'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import BackButton from '@/components/BackButton';
import { apiGet, getErrorMessage } from '@/lib/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

type PeriodMode = 'all' | 'month' | 'fy' | 'multi_month' | 'custom';

interface SummaryStats {
  total_income: number | string | null;
  total_expenses: number | string | null;
  transaction_count: number | string | null;
}

interface CategoryData {
  name: string;
  value: number | string;
}

interface MonthlyData {
  month: string;
  income: number | string;
  expenses: number | string;
}

interface TrendData {
  month: string;
  category: string;
  total: number | string;
}

interface DateRange {
  startDate: string;
  endDate: string;
  label: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function getMonthRange(month: string): DateRange | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    return null;
  }

  const [year, monthNumber] = month.split('-').map(Number);
  const endDay = new Date(year, monthNumber, 0).getDate();

  return {
    startDate: `${month}-01`,
    endDate: `${month}-${pad(endDay)}`,
    label: month,
  };
}

function getFyRange(fyStartYear: string): DateRange | null {
  if (!/^\d{4}$/.test(fyStartYear)) {
    return null;
  }

  const year = Number(fyStartYear);
  return {
    startDate: `${year}-04-01`,
    endDate: `${year + 1}-03-31`,
    label: `FY ${year}-${String(year + 1).slice(-2)}`,
  };
}

function getMultiMonthRange(startMonth: string, endMonth: string): DateRange | null {
  const start = getMonthRange(startMonth);
  const end = getMonthRange(endMonth);

  if (!start || !end || start.startDate > end.endDate) {
    return null;
  }

  return {
    startDate: start.startDate,
    endDate: end.endDate,
    label: `${startMonth} to ${endMonth}`,
  };
}

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function getCurrentFyStartYear(): string {
  const now = new Date();
  return String(now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1);
}

function formatCurrency(value: number): string {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function toNumber(value: number | string | null | undefined): number {
  return Number(value || 0);
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [periodMode, setPeriodMode] = useState<PeriodMode>('all');
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [fyStartYear, setFyStartYear] = useState(getCurrentFyStartYear());
  const [startMonth, setStartMonth] = useState(getCurrentMonth());
  const [endMonth, setEndMonth] = useState(getCurrentMonth());
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedRange, setAppliedRange] = useState<DateRange | null>(null);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [categoryData, setCategoryData] = useState<CategoryData[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const buildRange = useCallback((): DateRange | null => {
    if (periodMode === 'all') {
      return null;
    }

    if (periodMode === 'month') {
      return getMonthRange(selectedMonth);
    }

    if (periodMode === 'fy') {
      return getFyRange(fyStartYear);
    }

    if (periodMode === 'multi_month') {
      return getMultiMonthRange(startMonth, endMonth);
    }

    if (!customStart || !customEnd || customStart > customEnd) {
      return null;
    }

    return {
      startDate: customStart,
      endDate: customEnd,
      label: `${customStart} to ${customEnd}`,
    };
  }, [customEnd, customStart, endMonth, fyStartYear, periodMode, selectedMonth, startMonth]);

  const fetchAnalytics = useCallback(
    async (range: DateRange | null) => {
      setLoading(true);
      setError('');

      try {
        const token = localStorage.getItem('token');
        if (!token) {
          router.push('/auth');
          return;
        }

        const query = new URLSearchParams();
        if (range) {
          query.set('startDate', range.startDate);
          query.set('endDate', range.endDate);
        }
        const queryString = query.toString();
        const suffix = queryString ? `?${queryString}` : '';

        const [summaryData, pieData, barData, trendsData] = await Promise.all([
          apiGet<SummaryStats>(`${API_BASE_URL}/api/transactions/stats/summary${suffix}`, token),
          apiGet<CategoryData[]>(`${API_BASE_URL}/api/analytics/pie${suffix}`, token),
          apiGet<MonthlyData[]>(`${API_BASE_URL}/api/analytics/bar${suffix}`, token),
          apiGet<TrendData[]>(`${API_BASE_URL}/api/analytics/trends${suffix}`, token),
        ]);

        setSummary(summaryData);
        setCategoryData(pieData);
        setMonthlyData(barData);
        setTrendData(trendsData);
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth');
      return;
    }

    void Promise.resolve().then(() => fetchAnalytics(appliedRange));
  }, [appliedRange, fetchAnalytics, router]);

  const applyFilters = () => {
    const range = buildRange();
    if (periodMode !== 'all' && !range) {
      setError('Please select a valid analytics period.');
      return;
    }

    setAppliedRange(range);
  };

  const clearFilters = () => {
    setPeriodMode('all');
    setAppliedRange(null);
    setError('');
  };

  const totals = useMemo(() => {
    const income = toNumber(summary?.total_income);
    const expenses = toNumber(summary?.total_expenses);
    const count = toNumber(summary?.transaction_count);
    return {
      income,
      expenses,
      count,
      net: income - expenses,
      savingsRate: income > 0 ? Math.max(0, Math.round(((income - expenses) / income) * 100)) : 0,
    };
  }, [summary]);

  const categoryTotal = categoryData.reduce((sum, item) => sum + toNumber(item.value), 0);
  const topCategory = categoryData[0];
  const topCategoryShare =
    topCategory && categoryTotal > 0
      ? Math.round((toNumber(topCategory.value) / categoryTotal) * 100)
      : 0;
  const latestMonth = monthlyData[monthlyData.length - 1];
  const latestMonthNet = latestMonth
    ? toNumber(latestMonth.income) - toNumber(latestMonth.expenses)
    : 0;
  const highestExpenseMonth = monthlyData.reduce<MonthlyData | null>((highest, item) => {
    if (!highest || toNumber(item.expenses) > toNumber(highest.expenses)) {
      return item;
    }
    return highest;
  }, null);
  const topTrends = trendData.slice(0, 8);
  const periodLabel = appliedRange?.label || 'All time';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_48%,#f8fafc_100%)]">
      <AuthSessionGuard />

      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/85 shadow-sm backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <BackButton fallbackHref="/dashboard" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
                Finlytix
              </p>
              <h1 className="text-2xl font-bold text-gray-900">Analytics Studio</h1>
            </div>
          </div>
          <Link
            href="/dashboard"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8">
        <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-blue-950 to-indigo-900 text-white shadow-2xl">
          <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
            <div>
              <p className="mb-3 inline-flex rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-100">
                Analytics controls
              </p>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Slice your money data by any period.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100 sm:text-base">
                View spending by month, financial year, multiple months, or exact custom dates.
              </p>
            </div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-blue-100">Active Period</p>
              <p className="mt-2 text-2xl font-bold">{periodLabel}</p>
              <p
                className={`mt-4 text-3xl font-bold ${latestMonthNet >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
              >
                {latestMonth ? formatCurrency(latestMonthNet) : 'No monthly data'}
              </p>
              <p className="mt-1 text-sm text-blue-100">Latest month net</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white bg-white/90 p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">
                Period Filter
              </p>
              <h2 className="text-2xl font-bold text-gray-900">Choose analytics range</h2>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
              >
                All Time
              </button>
              <button
                type="button"
                onClick={applyFilters}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Apply
              </button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className="grid gap-2 sm:grid-cols-5 lg:grid-cols-1">
              {[
                ['all', 'All time'],
                ['month', 'Month'],
                ['fy', 'FY year'],
                ['multi_month', 'Multiple months'],
                ['custom', 'Custom dates'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPeriodMode(id as PeriodMode)}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition ${
                    periodMode === id
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="rounded-3xl border border-gray-100 bg-gradient-to-br from-white to-slate-50 p-5">
              {periodMode === 'all' && (
                <p className="text-sm text-gray-600">
                  Showing analytics for all imported transactions. Select another mode to narrow the
                  period.
                </p>
              )}

              {periodMode === 'month' && (
                <label className="block max-w-xs">
                  <span className="mb-2 block text-sm font-medium text-gray-700">
                    Statement Month
                  </span>
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(event) => setSelectedMonth(event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </label>
              )}

              {periodMode === 'fy' && (
                <label className="block max-w-xs">
                  <span className="mb-2 block text-sm font-medium text-gray-700">
                    FY Start Year
                  </span>
                  <select
                    value={fyStartYear}
                    onChange={(event) => setFyStartYear(event.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Array.from(
                      { length: 8 },
                      (_, index) => Number(getCurrentFyStartYear()) - index,
                    ).map((year) => (
                      <option key={year} value={year}>
                        FY {year}-{String(year + 1).slice(-2)}
                      </option>
                    ))}
                  </select>
                  <span className="mt-2 block text-xs text-gray-500">
                    Financial year runs from April 1 to March 31.
                  </span>
                </label>
              )}

              {periodMode === 'multi_month' && (
                <div className="grid max-w-xl gap-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-2 block text-sm font-medium text-gray-700">
                      Start Month
                    </span>
                    <input
                      type="month"
                      value={startMonth}
                      onChange={(event) => setStartMonth(event.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <label>
                    <span className="mb-2 block text-sm font-medium text-gray-700">End Month</span>
                    <input
                      type="month"
                      value={endMonth}
                      onChange={(event) => setEndMonth(event.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                </div>
              )}

              {periodMode === 'custom' && (
                <div className="grid max-w-xl gap-4 sm:grid-cols-2">
                  <label>
                    <span className="mb-2 block text-sm font-medium text-gray-700">Start Date</span>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(event) => setCustomStart(event.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                  <label>
                    <span className="mb-2 block text-sm font-medium text-gray-700">End Date</span>
                    <input
                      type="date"
                      min={customStart || undefined}
                      value={customEnd}
                      onChange={(event) => setCustomEnd(event.target.value)}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </label>
                </div>
              )}
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[
            ['Income', formatCurrency(totals.income), 'text-emerald-600', 'bg-emerald-50'],
            ['Expenses', formatCurrency(totals.expenses), 'text-red-600', 'bg-red-50'],
            [
              'Net',
              formatCurrency(totals.net),
              totals.net >= 0 ? 'text-blue-600' : 'text-red-600',
              'bg-blue-50',
            ],
            ['Transactions', String(totals.count), 'text-slate-800', 'bg-slate-50'],
          ].map(([label, value, textClass, bgClass]) => (
            <div key={label} className="rounded-3xl border border-white bg-white/90 p-5 shadow-sm">
              <p className="text-sm font-semibold text-gray-500">{label}</p>
              <p className={`mt-2 text-2xl font-bold ${textClass}`}>{loading ? '...' : value}</p>
              <div className={`mt-4 h-1.5 rounded-full ${bgClass}`} />
            </div>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-600">
              Top Category
            </p>
            <p className="mt-2 text-xl font-bold text-gray-900">{topCategory?.name || 'No data'}</p>
            <p className="mt-1 text-sm text-gray-500">
              {topCategoryShare > 0
                ? `${topCategoryShare}% of categorized expenses`
                : 'Upload data to analyze'}
            </p>
          </div>
          <div className="rounded-3xl border border-emerald-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-600">
              Savings Rate
            </p>
            <p className="mt-2 text-xl font-bold text-gray-900">{totals.savingsRate}%</p>
            <p className="mt-1 text-sm text-gray-500">Income retained in this period.</p>
          </div>
          <div className="rounded-3xl border border-amber-100 bg-white p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-600">
              Peak Expense Month
            </p>
            <p className="mt-2 text-xl font-bold text-gray-900">
              {highestExpenseMonth?.month || 'No data'}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              {highestExpenseMonth
                ? formatCurrency(toNumber(highestExpenseMonth.expenses))
                : 'No spending trend yet'}
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-[1.75rem] border border-gray-100 bg-white/95 p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Category Breakdown</h3>
                <p className="text-sm text-gray-500">Expense mix for {periodLabel}.</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                {categoryData.length} categories
              </span>
            </div>

            <div className="flex min-h-96 items-center justify-center">
              {categoryData.length > 0 ? (
                <ResponsiveContainer width="100%" height={330}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={105}
                      paddingAngle={3}
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {categoryData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      contentStyle={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.12)',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="rounded-3xl border border-dashed border-blue-200 bg-blue-50/60 px-6 py-10 text-center">
                  <p className="text-lg font-semibold text-blue-900">
                    No expense data in this period
                  </p>
                  <p className="mt-2 text-sm text-blue-700">
                    Try a wider range or upload a statement.
                  </p>
                </div>
              )}
            </div>

            {categoryData.length > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {categoryData.slice(0, 8).map((item, index) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-2 text-gray-700">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(toNumber(item.value))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[1.75rem] border border-gray-100 bg-white/95 p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Monthly Flow</h3>
                <p className="text-sm text-gray-500">Income and expenses over time.</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                {monthlyData.length} months
              </span>
            </div>

            <div className="flex min-h-96 items-center justify-center">
              {monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={monthlyData} barGap={8}>
                    <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} width={72} />
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      contentStyle={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '16px',
                        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.12)',
                      }}
                    />
                    <Legend iconType="circle" />
                    <Bar dataKey="income" fill="#10b981" name="Income" radius={[10, 10, 0, 0]} />
                    <Bar
                      dataKey="expenses"
                      fill="#ef4444"
                      name="Expenses"
                      radius={[10, 10, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="rounded-3xl border border-dashed border-emerald-200 bg-emerald-50/60 px-6 py-10 text-center">
                  <p className="text-lg font-semibold text-emerald-900">No monthly trend yet</p>
                  <p className="mt-2 text-sm text-emerald-700">
                    Try a wider period to compare cash flow.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white bg-white/90 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900">Category Trends</h3>
              <p className="text-sm text-gray-500">Top month/category expense combinations.</p>
            </div>
            <Link
              href="/transactions"
              className="text-sm font-semibold text-blue-600 hover:text-blue-700"
            >
              View transactions
            </Link>
          </div>

          {topTrends.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {topTrends.map((item, index) => (
                <div
                  key={`${item.month}-${item.category}-${index}`}
                  className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{item.category || 'Other'}</p>
                    <p className="text-sm text-gray-500">{item.month}</p>
                  </div>
                  <p className="font-bold text-red-600">{formatCurrency(toNumber(item.total))}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-slate-50 px-6 py-8 text-center">
              <p className="font-semibold text-gray-900">No category trends for this period</p>
              <p className="mt-1 text-sm text-gray-500">
                Try changing the filter or categorizing transactions.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
