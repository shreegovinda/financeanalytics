'use client';
import { useEffect, useState } from 'react';
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
export default function BankSettings() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
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
  async function change(action: 'add' | 'remove' | 'toggle', bank?: Bank) {
    setBusy(true);
    setError('');
    setMessage('');
    const token = localStorage.getItem('token') ?? undefined;
    try {
      if (action === 'add') {
        await apiPost(`${API}/api/banks`, { catalogueId: selected }, token);
        setSelected('');
        setSearch('');
      } else if (bank && action === 'remove') await apiDelete(`${API}/api/banks/${bank.id}`, token);
      else if (bank) await apiPut(`${API}/api/banks/${bank.id}`, { active: !bank.active }, token);
      await reload();
      setMessage('Bank settings saved.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  const filtered = choices.filter(
    (c) =>
      !banks.some((b) => b.catalogue_id === c.id) &&
      (c.name + ' ' + c.id).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="mb-8 rounded-2xl border border-indigo-100 bg-indigo-50/70 p-5">
      <h2 className="text-lg font-bold text-gray-900">Bank accounts</h2>
      <p className="mt-1 text-sm text-gray-600">
        Select your Indian banks. Active banks appear during upload. Banks with statement history
        can be deactivated and reactivated.
      </p>
      {loading ? (
        <p role="status">Loading banks…</p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {banks.map((bank) => (
              <li
                key={bank.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-white p-3"
              >
                <span className="text-gray-900">
                  {bank.name}
                  <span className="ml-2 text-xs text-gray-500">
                    {bank.active ? 'Active' : 'Inactive'}
                    {bank.has_statements ? ' · Has statements' : ''}
                  </span>
                </span>
                <div className="flex gap-3">
                  {(bank.active || bank.catalogue_id) && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void change('toggle', bank)}
                      className="text-sm font-semibold text-indigo-700 disabled:opacity-50"
                    >
                      {bank.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  )}
                  {!bank.has_statements && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void change('remove', bank)}
                      className="text-sm font-semibold text-red-700 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {banks.length === 0 && (
            <p className="mt-3 text-sm text-gray-500">No banks selected yet.</p>
          )}
          <label htmlFor="bank-search" className="mt-4 block text-sm font-medium text-gray-900">
            Search Indian banks
          </label>
          <input
            id="bank-search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected('');
            }}
            placeholder="Search by bank name, e.g. HDFC or SBI"
            className="mt-2 w-full rounded-xl border border-gray-300 bg-white p-3 text-gray-900"
          />
          <label htmlFor="bank-choice" className="mt-3 block text-sm font-medium text-gray-900">
            Select a bank
          </label>
          <select
            id="bank-choice"
            size={6}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="mt-2 w-full rounded-xl border border-gray-300 bg-white p-2 text-gray-900"
          >
            {filtered.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.category}
              </option>
            ))}
          </select>
          {filtered.length === 0 && (
            <p className="text-sm text-gray-600">No matching banks available to add.</p>
          )}
          <button
            type="button"
            disabled={busy || !selected}
            onClick={() => void change('add')}
            className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Add bank'}
          </button>
          <p className="mt-3 text-xs text-gray-500">
            Catalogue covers domestic commercial and regional rural banks. Cooperative banks are not
            yet included.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-green-700">
          {message}
        </p>
      )}
    </section>
  );
}
