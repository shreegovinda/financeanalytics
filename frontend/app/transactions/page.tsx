'use client';

import React, { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
import type { ColDef, GridApi, ICellRendererParams } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import AuthSessionGuard from '@/components/AuthSessionGuard';
import BackButton from '@/components/BackButton';
import { apiGet, apiPut, getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/date';

ModuleRegistry.registerModules([AllCommunityModule]);

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
  parent_id?: string | null;
}

// Enriched row shape fed into AG Grid
interface TxnRow {
  id: string;
  date: string;
  dateDisplay: string;
  description: string;
  type: string;
  amount: number;
  amountDisplay: string;
  categoryId: string;
  parentName: string;
  parentColor: string;
  subName: string;
  subColor: string;
  aiSuggested: string;
}

interface GridContext {
  onEdit: (row: TxnRow) => void;
}

function CategoryCellRenderer({ data }: ICellRendererParams<TxnRow>) {
  if (!data) return null;
  if (!data.parentName) {
    return (
      <span className="text-gray-400 italic text-xs">{data.aiSuggested || 'Uncategorized'}</span>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: data.parentColor }}
      />
      <span className="text-sm">{data.parentName}</span>
    </div>
  );
}

function SubcategoryCellRenderer({ data }: ICellRendererParams<TxnRow>) {
  if (!data) return null;
  if (!data.subName) return <span className="text-gray-300 text-sm">—</span>;
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: data.subColor }}
      />
      <span className="text-sm text-gray-600">{data.subName}</span>
    </div>
  );
}

function TypeCellRenderer({ data }: ICellRendererParams<TxnRow>) {
  if (!data) return null;
  const isCredit = data.type === 'credit';
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
        isCredit ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {isCredit ? 'Credit' : 'Debit'}
    </span>
  );
}

function AmountCellRenderer({ data }: ICellRendererParams<TxnRow>) {
  if (!data) return null;
  return (
    <span className={`font-semibold ${data.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
      {data.amountDisplay}
    </span>
  );
}

function StyledSelect({
  value,
  onChange,
  disabled,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full appearance-none pl-3.5 pr-9 py-2.5 text-sm text-gray-900 bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 cursor-pointer hover:border-gray-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-gray-50"
      >
        {children}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        <svg
          className="w-3.5 h-3.5 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  );
}

function EditCellRenderer({ data, context }: ICellRendererParams<TxnRow, unknown, GridContext>) {
  if (!data) return null;
  return (
    <button
      onClick={() => context?.onEdit(data)}
      className="px-2.5 py-1 bg-blue-50 text-blue-600 text-xs rounded-md hover:bg-blue-100 cursor-pointer border border-blue-200"
    >
      Edit
    </button>
  );
}

type FilterMode =
  | 'all'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_fy'
  | 'last_fy'
  | 'custom';

const FILTER_CHIPS: { id: FilterMode; label: string }[] = [
  { id: 'all', label: 'All Time' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_quarter', label: 'This Quarter' },
  { id: 'this_fy', label: 'This FY' },
  { id: 'last_fy', label: 'Last FY' },
  { id: 'custom', label: 'Custom' },
];

function getIsoRange(mode: FilterMode): { start: string; end: string } | null {
  if (mode === 'all' || mode === 'custom') return null;
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDayOf = (yr: number, mo: number) => new Date(yr, mo + 1, 0).getDate();
  switch (mode) {
    case 'this_month':
      return { start: `${y}-${pad(m + 1)}-01`, end: `${y}-${pad(m + 1)}-${lastDayOf(y, m)}` };
    case 'last_month': {
      const lm = m === 0 ? 11 : m - 1;
      const ly = m === 0 ? y - 1 : y;
      return { start: `${ly}-${pad(lm + 1)}-01`, end: `${ly}-${pad(lm + 1)}-${lastDayOf(ly, lm)}` };
    }
    case 'this_quarter': {
      const qs = Math.floor(m / 3) * 3;
      const qe = qs + 2;
      return { start: `${y}-${pad(qs + 1)}-01`, end: `${y}-${pad(qe + 1)}-${lastDayOf(y, qe)}` };
    }
    case 'this_fy': {
      const fys = m >= 3 ? y : y - 1;
      return { start: `${fys}-04-01`, end: `${fys + 1}-03-31` };
    }
    case 'last_fy': {
      const fys = m >= 3 ? y - 1 : y - 2;
      return { start: `${fys}-04-01`, end: `${fys + 1}-03-31` };
    }
  }
}

export default function TransactionsPage() {
  const router = useRouter();
  const gridRef = useRef<AgGridReact<TxnRow>>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filter state
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [appliedStart, setAppliedStart] = useState('');
  const [appliedEnd, setAppliedEnd] = useState('');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Inline edit state (for the category edit modal inside the grid)
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);
  const [editParentId, setEditParentId] = useState('');
  const [editSubId, setEditSubId] = useState('');
  const [saving, setSaving] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const fetchData = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const query = new URLSearchParams({ limit: '5000' });
      if (appliedStart) query.set('startDate', appliedStart);
      if (appliedEnd) query.set('endDate', appliedEnd);
      const [txnData, catData] = await Promise.all([
        apiGet<Transaction[]>(`${apiUrl}/api/transactions?${query.toString()}`, token ?? undefined),
        apiGet<Category[]>(`${apiUrl}/api/categories`, token ?? undefined),
      ]);
      setTransactions(txnData);
      setCategories(catData);
      setError('');
    } catch (err) {
      setError('Failed to load transactions');
      console.error(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [appliedStart, appliedEnd]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/auth');
      return;
    }
    void Promise.resolve().then(fetchData);
  }, [fetchData, router]);

  const applyFilter = (mode: FilterMode) => {
    setFilterMode(mode);
    if (mode === 'custom') return;
    const range = getIsoRange(mode);
    setAppliedStart(range?.start ?? '');
    setAppliedEnd(range?.end ?? '');
  };

  const applyCustom = () => {
    setAppliedStart(customStart);
    setAppliedEnd(customEnd);
  };

  // ── Category helpers ────────────────────────────────────────────────────────
  const rootCategories = useMemo(() => categories.filter((c) => !c.parent_id), [categories]);
  const subCatsFor = useMemo(
    () => (parentId: string) => categories.filter((c) => c.parent_id === parentId),
    [categories],
  );

  const resolveCats = useCallback(
    (categoryId: string | undefined) => {
      if (!categoryId) return { parent: null, sub: null };
      const cat = categories.find((c) => c.id === categoryId);
      if (!cat) return { parent: null, sub: null };
      if (cat.parent_id) {
        const parent = categories.find((c) => c.id === cat.parent_id) ?? null;
        return { parent, sub: cat };
      }
      return { parent: cat, sub: null };
    },
    [categories],
  );

  const gridContext = useMemo<GridContext>(
    () => ({
      onEdit: (row: TxnRow) => {
        const { parent, sub } = resolveCats(row.categoryId);
        setEditingTxnId(row.id);
        setEditParentId(parent?.id ?? '');
        setEditSubId(sub?.id ?? '');
      },
    }),
    [resolveCats],
  );

  // ── Enrich transactions → row data ─────────────────────────────────────────
  const rowData = useMemo<TxnRow[]>(
    () =>
      transactions.map((t) => {
        const { parent, sub } = resolveCats(t.category_id);
        return {
          id: t.id,
          date: t.date,
          dateDisplay: formatDate(t.date),
          description: t.description,
          type: t.type,
          amount: Number(t.amount),
          amountDisplay: `${t.type === 'credit' ? '+' : '-'}₹${Number(t.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          categoryId: t.category_id ?? '',
          parentName: parent?.name ?? '',
          parentColor: parent?.color ?? '#9ca3af',
          subName: sub?.name ?? '',
          subColor: sub?.color ?? '',
          aiSuggested: t.ai_suggested_category ?? '',
        };
      }),
    [transactions, resolveCats],
  );

  // ── Derived summary stats ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    const income = transactions
      .filter((t) => t.type === 'credit')
      .reduce((s, t) => s + Number(t.amount), 0);
    const expenses = transactions
      .filter((t) => t.type === 'debit')
      .reduce((s, t) => s + Number(t.amount), 0);
    return { income, expenses, net: income - expenses, count: transactions.length };
  }, [transactions]);

  // ── Category breakdown ──────────────────────────────────────────────────────
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; color: string; total: number }>();
    for (const txn of transactions) {
      if (txn.type !== 'debit') continue;
      const amount = Number(txn.amount);
      if (txn.category_id) {
        const cat = categories.find((c) => c.id === txn.category_id);
        if (cat) {
          const parentId = cat.parent_id ?? cat.id;
          const parent = cat.parent_id ? categories.find((c) => c.id === cat.parent_id) : cat;
          if (parent) {
            const ex = map.get(parentId);
            if (ex) ex.total += amount;
            else map.set(parentId, { name: parent.name, color: parent.color, total: amount });
          }
        }
      } else {
        const unc = map.get('__unc__');
        if (unc) unc.total += amount;
        else map.set('__unc__', { name: 'Uncategorized', color: '#9ca3af', total: amount });
      }
    }
    return [...map.entries()]
      .map(([id, d]) => ({ id, ...d }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 7);
  }, [transactions, categories]);

  const maxCatTotal = categoryBreakdown[0]?.total ?? 1;

  const periodLabel = useMemo(() => {
    if (filterMode === 'custom' && appliedStart && appliedEnd)
      return `${appliedStart} → ${appliedEnd}`;
    return FILTER_CHIPS.find((c) => c.id === filterMode)?.label ?? '';
  }, [filterMode, appliedStart, appliedEnd]);

  // ── Save category edit ──────────────────────────────────────────────────────
  const saveCategory = async () => {
    if (!editingTxnId || !editParentId) return;
    const categoryId = editSubId || editParentId;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      await apiPut(
        `${apiUrl}/api/transactions/${editingTxnId}`,
        { categoryId },
        token ?? undefined,
      );
      setTransactions((prev) =>
        prev.map((t) => (t.id === editingTxnId ? { ...t, category_id: categoryId } : t)),
      );
      setEditingTxnId(null);
      setEditParentId('');
      setEditSubId('');
    } catch (err) {
      setError('Failed to update category');
      console.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  // ── AG Grid column definitions ──────────────────────────────────────────────
  const colDefs = useMemo<ColDef<TxnRow>[]>(
    () => [
      {
        field: 'dateDisplay',
        headerName: 'Date',
        width: 120,
        sortable: true,
        filter: 'agTextColumnFilter',
        comparator: (_a, _b, nodeA, nodeB) =>
          nodeA.data!.date < nodeB.data!.date ? -1 : nodeA.data!.date > nodeB.data!.date ? 1 : 0,
      },
      {
        field: 'description',
        headerName: 'Description',
        flex: 2,
        sortable: true,
        filter: 'agTextColumnFilter',
        tooltipField: 'description',
      },
      {
        field: 'parentName',
        headerName: 'Category',
        width: 150,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: CategoryCellRenderer,
      },
      {
        field: 'subName',
        headerName: 'Subcategory',
        width: 150,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: SubcategoryCellRenderer,
      },
      {
        field: 'type',
        headerName: 'Type',
        width: 110,
        sortable: true,
        filter: 'agTextColumnFilter',
        cellRenderer: TypeCellRenderer,
      },
      {
        field: 'amount',
        headerName: 'Amount',
        width: 140,
        sortable: true,
        filter: 'agNumberColumnFilter',
        type: 'numericColumn',
        cellRenderer: AmountCellRenderer,
      },
      {
        headerName: 'Action',
        width: 90,
        sortable: false,
        filter: false,
        cellRenderer: EditCellRenderer,
      },
    ],
    [],
  );

  const defaultColDef = useMemo<ColDef>(
    () => ({
      resizable: true,
      suppressMovable: false,
      floatingFilter: true,
    }),
    [],
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <AuthSessionGuard />
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <BackButton className="shadow-sm" />
            <h1 className="text-xl font-bold text-gray-900">Transactions</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/settings"
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition cursor-pointer"
            >
              Categories
            </Link>
            <Link
              href="/dashboard"
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError('')}
              className="text-red-400 hover:text-red-600 cursor-pointer ml-3"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Filter panel ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Filter Period
          </p>
          <div className="flex flex-wrap gap-2">
            {FILTER_CHIPS.map((chip) => (
              <button
                key={chip.id}
                onClick={() => applyFilter(chip.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors cursor-pointer ${
                  filterMode === chip.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400 hover:text-blue-600'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {filterMode === 'custom' && (
            <div className="flex flex-wrap gap-3 items-end pt-1">
              <div>
                <label className="block text-xs text-gray-500 mb-1">From</label>
                <input
                  type="date"
                  max={today}
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-3 py-2 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">To</label>
                <input
                  type="date"
                  max={today}
                  min={customStart || undefined}
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-3 py-2 text-sm text-gray-900 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none cursor-pointer"
                />
              </div>
              <button
                onClick={applyCustom}
                disabled={!customStart || !customEnd}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer"
              >
                Apply
              </button>
              <button
                onClick={() => {
                  setCustomStart('');
                  setCustomEnd('');
                  setAppliedStart('');
                  setAppliedEnd('');
                }}
                className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200 transition cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {/* ── Summary cards ── */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white rounded-xl border border-gray-200 p-4 h-24 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Income</p>
              <p className="text-xl font-bold text-green-600">
                ₹
                {stats.income.toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-gray-400 mt-1">{periodLabel}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Expenses</p>
              <p className="text-xl font-bold text-red-600">
                ₹
                {stats.expenses.toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-gray-400 mt-1">{periodLabel}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Net Savings</p>
              <p
                className={`text-xl font-bold ${stats.net >= 0 ? 'text-blue-600' : 'text-red-500'}`}
              >
                {stats.net >= 0 ? '+' : ''}₹
                {Math.abs(stats.net).toLocaleString('en-IN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-gray-400 mt-1">{periodLabel}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Transactions</p>
              <p className="text-xl font-bold text-gray-800">{stats.count}</p>
              <p className="text-xs text-gray-400 mt-1">{periodLabel}</p>
            </div>
          </div>
        )}

        {/* ── Spending by category ── */}
        {!loading && categoryBreakdown.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-gray-700">Spending by Category</p>
              <p className="text-xs text-gray-400">{periodLabel} · debits only</p>
            </div>
            <div className="space-y-3">
              {categoryBreakdown.map((cat) => {
                const pct = Math.round((cat.total / maxCatTotal) * 100);
                const share =
                  stats.expenses > 0 ? Math.round((cat.total / stats.expenses) * 100) : 0;
                return (
                  <div key={cat.id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="text-sm text-gray-700">{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">{share}%</span>
                        <span className="text-sm font-medium text-gray-800">
                          ₹
                          {cat.total.toLocaleString('en-IN', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: cat.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── AG Grid table ── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Transactions</p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400">
                {stats.count} records · click column header to sort · filter in search boxes below
                headers
              </span>
              <button
                onClick={() =>
                  gridApi?.exportDataAsCsv({ fileName: `transactions-${periodLabel}.csv` })
                }
                className="px-3 py-1 text-xs text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 cursor-pointer transition"
              >
                Export CSV
              </button>
            </div>
          </div>

          {loading ? (
            <div className="p-8 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="ag-theme-quartz" style={{ height: 520 }}>
              <AgGridReact<TxnRow>
                ref={gridRef}
                rowData={rowData}
                columnDefs={colDefs}
                defaultColDef={defaultColDef}
                context={gridContext}
                onGridReady={(p) => setGridApi(p.api)}
                animateRows
                pagination
                paginationPageSize={25}
                paginationPageSizeSelector={[25, 50, 100, 250]}
                rowHeight={44}
                headerHeight={44}
                floatingFiltersHeight={38}
                suppressRowClickSelection
                enableCellTextSelection
                theme="legacy"
                tooltipShowDelay={300}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Category edit modal ── */}
      {editingTxnId && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingTxnId(null);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 border border-gray-100"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-gray-900">Assign Category</h3>
              <button
                onClick={() => setEditingTxnId(null)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Category <span className="text-red-400">*</span>
                </label>
                <StyledSelect
                  value={editParentId}
                  onChange={(v) => {
                    setEditParentId(v);
                    setEditSubId('');
                  }}
                >
                  <option value="">Select a category…</option>
                  {rootCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </StyledSelect>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Subcategory <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <StyledSelect value={editSubId} onChange={setEditSubId} disabled={!editParentId}>
                  <option value="">No subcategory</option>
                  {subCatsFor(editParentId).map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </StyledSelect>
                {!editParentId && (
                  <p className="text-xs text-gray-400 mt-1">Select a category first</p>
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end mt-6">
              <button
                onClick={() => setEditingTxnId(null)}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveCategory()}
                disabled={!editParentId || saving}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 cursor-pointer shadow-sm transition-colors"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
