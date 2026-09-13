'use client';

import { useEffect, useState, useMemo } from 'react';
import { apiGet, apiPost, apiPut, apiDelete, getErrorMessage } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface Bank {
  id: string;
  name: string;
  active: boolean;
  has_statements: boolean;
  catalogue_id: string | null;
}

interface Choice {
  id: string;
  name: string;
  category: string;
}

const POPULAR_BANK_NAMES = [
  'State Bank of India',
  'HDFC Bank',
  'ICICI Bank',
  'Axis Bank',
  'Kotak Mahindra Bank',
  'Punjab National Bank',
  'Bank of Baroda',
];

export default function BankSettings() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function reload() {
    const token = localStorage.getItem('token') ?? undefined;
    const result = await apiGet<{ banks: Bank[] }>(`${API}/api/banks`, token);
    setBanks(result.banks);
  }

  useEffect(() => {
    const token = localStorage.getItem('token') ?? undefined;
    Promise.all([
      apiGet<{ banks: Bank[] }>(`${API}/api/banks`, token),
      apiGet<{ banks: Choice[] }>(`${API}/api/banks/catalogue`, token),
    ])
      .then(([saved, catalogue]) => {
        setBanks(saved.banks);
        setChoices(catalogue.banks);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  async function change(
    action: 'add' | 'remove' | 'toggle',
    targetBank?: Bank,
    specificId?: string,
  ) {
    const idToAdd = specificId || selectedId;
    if (action === 'add' && !idToAdd) return;

    setBusy(true);
    setError('');
    setMessage('');
    const token = localStorage.getItem('token') ?? undefined;

    try {
      if (action === 'add') {
        await apiPost(`${API}/api/banks`, { catalogueId: idToAdd }, token);
        setSelectedId('');
        setSearch('');
        setMessage('Bank account added successfully.');
      } else if (targetBank && action === 'remove') {
        await apiDelete(`${API}/api/banks/${targetBank.id}`, token);
        setMessage('Bank account removed.');
      } else if (targetBank && action === 'toggle') {
        await apiPut(`${API}/api/banks/${targetBank.id}`, { active: !targetBank.active }, token);
        setMessage(`Bank account ${targetBank.active ? 'deactivated' : 'reactivated'}.`);
      }
      await reload();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const unlinkedChoices = useMemo(() => {
    return choices.filter((c) => !banks.some((b) => b.catalogue_id === c.id));
  }, [choices, banks]);

  const filtered = useMemo(() => {
    if (!search.trim()) return unlinkedChoices.slice(0, 15);
    const query = search.toLowerCase().trim();
    return unlinkedChoices.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.category.toLowerCase().includes(query) ||
        c.id.toLowerCase().includes(query),
    );
  }, [unlinkedChoices, search]);

  const popularUnlinked = useMemo(() => {
    return choices.filter(
      (c) =>
        POPULAR_BANK_NAMES.some((pop) => c.name.toLowerCase().includes(pop.toLowerCase())) &&
        !banks.some((b) => b.catalogue_id === c.id),
    );
  }, [choices, banks]);

  const selectedBank = choices.find((c) => c.id === selectedId);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedId) {
        void change('add', undefined, selectedId);
      } else if (filtered.length > 0) {
        void change('add', undefined, filtered[0].id);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Messages */}
      {error && (
        <div className="flex items-center justify-between rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError('')}
            className="text-red-500 hover:text-red-700 font-bold"
          >
            ✕
          </button>
        </div>
      )}
      {message && (
        <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-base">✓</span>
            <span>{message}</span>
          </div>
          <button
            type="button"
            onClick={() => setMessage('')}
            className="text-emerald-600 hover:text-emerald-800 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Linked Banks Card */}
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Your Linked Banks</h2>
            <p className="mt-1 text-sm text-gray-500">
              Only active banks appear as options when uploading statements.
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            {banks.length} linked
          </span>
        </div>

        {loading ? (
          <div className="mt-6 flex items-center justify-center py-8 text-sm text-gray-400">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mr-2" />
            Loading your bank accounts…
          </div>
        ) : banks.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 text-xl font-bold">
              🏦
            </div>
            <h3 className="mt-3 text-sm font-semibold text-gray-900">
              No bank accounts linked yet
            </h3>
            <p className="mt-1 text-xs text-gray-500 max-w-sm mx-auto">
              Link your Indian bank accounts below to start uploading statements and tracking your
              cash flow.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {banks.map((bank) => (
              <div
                key={bank.id}
                className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 font-bold text-white text-sm shadow-sm">
                    {bank.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-900 leading-tight">
                      {bank.name}
                    </h4>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          bank.active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-gray-100 text-gray-600 border border-gray-200'
                        }`}
                      >
                        {bank.active ? 'Active' : 'Inactive'}
                      </span>
                      {bank.has_statements && (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 border border-blue-200">
                          Statements
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void change('toggle', bank)}
                    title={bank.active ? 'Deactivate this bank' : 'Reactivate this bank'}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition cursor-pointer disabled:opacity-50 ${
                      bank.active
                        ? 'border border-gray-200 text-gray-700 hover:bg-gray-100'
                        : 'border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                    }`}
                  >
                    {bank.active ? 'Deactivate' : 'Activate'}
                  </button>
                  {!bank.has_statements && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void change('remove', bank)}
                      title="Remove unlinked bank"
                      className="rounded-lg p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer disabled:opacity-50"
                    >
                      <span className="sr-only">Remove</span>
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Add Bank Section */}
      <section className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/40 to-white p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white text-xs font-bold">
            +
          </div>
          <h2 className="text-lg font-bold text-gray-900">Add a Bank Account</h2>
        </div>
        <p className="text-sm text-gray-600">
          Search the RBI-recognized catalogue of 80+ Indian commercial, private, and regional rural
          banks.
        </p>

        {/* Popular Banks Chips */}
        {popularUnlinked.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
              Popular Indian Banks
            </p>
            <div className="flex flex-wrap gap-2">
              {popularUnlinked.map((pop) => (
                <button
                  key={pop.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void change('add', undefined, pop.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-900 shadow-sm transition hover:border-indigo-400 hover:bg-indigo-50 active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  <span>+</span>
                  <span>{pop.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search Input */}
        <div className="mt-5">
          <label
            htmlFor="bank-search"
            className="block text-xs font-semibold uppercase tracking-wide text-gray-700 mb-1.5"
          >
            Search All Banks
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400 pointer-events-none">
              🔍
            </span>
            <input
              id="bank-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by bank name or code, e.g. HDFC, SBI, Axis, ICICI..."
              className="w-full rounded-xl border border-gray-300 bg-white pl-10 pr-10 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 shadow-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setSelectedId('');
                }}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-xs text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Search Results / Bank Selection Cards */}
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-2">
            {filtered.length} bank{filtered.length === 1 ? '' : 's'} available to add
          </p>

          <div className="max-h-60 overflow-y-auto space-y-1.5 rounded-xl border border-gray-200 bg-white p-2 shadow-inner">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-500">
                No matching banks found for &quot;{search}&quot;. Try another bank name.
              </div>
            ) : (
              filtered.map((c) => {
                const isCurrent = selectedId === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`flex items-center justify-between gap-3 rounded-lg p-2.5 transition cursor-pointer ${
                      isCurrent
                        ? 'bg-indigo-50 border border-indigo-300 shadow-sm'
                        : 'border border-transparent hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                          isCurrent ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {c.name.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                        <p className="text-[11px] text-gray-500 truncate">{c.category}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={(e) => {
                          e.stopPropagation();
                          void change('add', undefined, c.id);
                        }}
                        className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 active:scale-95 transition cursor-pointer disabled:opacity-50"
                      >
                        + Add Bank
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Selected Bank Confirmation Action */}
        {selectedBank && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/80 p-3">
            <div className="flex items-center gap-2 text-xs text-indigo-900">
              <span className="font-bold">Selected:</span>
              <span>
                {selectedBank.name} ({selectedBank.category})
              </span>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void change('add')}
              className="rounded-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow hover:bg-indigo-700 active:scale-95 transition cursor-pointer disabled:opacity-50"
            >
              {busy ? 'Adding…' : `Confirm Add ${selectedBank.name}`}
            </button>
          </div>
        )}

        <p className="mt-3 text-xs text-gray-500">
          Note: Cooperative banks are governed by state registrars and are not yet part of the
          central RBI schedule.
        </p>
      </section>
    </div>
  );
}
