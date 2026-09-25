'use client';

import { useEffect, useState } from 'react';
import { apiFetch, apiGet, getErrorMessage, AICatalogueResponse } from '@/lib/api';

interface Setting {
  provider: string;
  model: string;
  key_mode: 'admin' | 'personal' | 'saved';
  key_hint: string | null;
  updated_at: string;
  validated_at: string | null;
}
interface UseCase {
  id: string;
  label: string;
  description: string;
  setting: Setting | null;
}
const endpoint = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/ai/use-cases`;
const icons: Record<string, string> = {
  text_chat: 'M7 8h10M7 12h6M5 3h14a2 2 0 012 2v12a2 2 0 01-2 2H9l-6 3V5a2 2 0 012-2Z',
  voice_chat: 'M9 5a3 3 0 016 0v6a3 3 0 01-6 0V5ZM5 10v1a7 7 0 0014 0v-1M12 18v4M8 22h8',
  statement_extraction:
    'M14 2H5a2 2 0 00-2 2v16a2 2 0 002 2h14a2 2 0 002-2V9l-7-7ZM14 2v7h7M7 13h10M7 17h7',
  categorization: 'M3 3h7v7H3V3ZM14 3h7v7h-7V3ZM3 14h7v7H3v-7ZM14 14h7v7h-7v-7Z',
  bill_extraction: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 7h6M9 11h6M9 15h3',
  whatsapp_chat:
    'M21 11a9 9 0 01-9 9 10 10 0 01-4-1l-5 2 2-5a10 10 0 01-1-4 9 9 0 0117-1ZM8 8c1 4 3 6 7 7',
};
function FeatureIcon({ id }: { id: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={icons[id] || icons.text_chat} />
    </svg>
  );
}
async function persist(id: string, body: unknown) {
  const response = await apiFetch(`${endpoint}/${id}`, {
    method: 'PUT',
    timeout: 30000,
    retries: 0,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to save settings. Please retry.');
}
function UseCaseCard({
  item,
  catalogue,
  onSaved,
}: {
  item: UseCase;
  catalogue: AICatalogueResponse;
  onSaved: (message: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState(item.setting?.provider || '');
  const [model, setModel] = useState(item.setting?.model || '');
  const [keyMode, setKeyMode] = useState<'admin' | 'personal'>(
    item.setting?.key_mode === 'admin' ? 'admin' : 'personal',
  );
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const providerConfig = catalogue.catalogue.providers.find((entry) => entry.id === provider);
  const keepsKey = item.setting?.provider === provider && item.setting?.key_mode === 'personal';
  const connected = Boolean(item.setting);
  const verified = Boolean(item.setting?.validated_at);
  const savedProvider = catalogue.catalogue.providers.find(
    (entry) => entry.id === item.setting?.provider,
  );
  const savedModel = savedProvider?.models.find((entry) => entry.id === item.setting?.model);
  const inputStyle =
    'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100';
  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition ${editing ? 'border-teal-300 ring-2 ring-teal-50' : 'border-slate-200 hover:border-slate-300'}`}
    >
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <span
            className={`rounded-xl p-2.5 ${connected ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-500'}`}
          >
            <FeatureIcon id={item.id} />
          </span>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${verified ? 'bg-emerald-50 text-emerald-700' : connected ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}
          >
            {verified ? '✓ Validated' : connected ? 'Needs validation' : 'Setup required'}
          </span>
        </div>
        <h3 className="mt-4 text-base font-semibold tracking-tight text-slate-900">{item.label}</h3>
        <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">{item.description}</p>
        <div className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            {connected ? savedProvider?.label || item.setting?.provider : 'Your choice'}
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-slate-800">
            {connected ? savedModel?.label || item.setting?.model : 'Choose a model to get started'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {connected
              ? item.setting?.key_mode === 'admin'
                ? 'Platform key'
                : `Your key · ${item.setting?.key_hint || 'Replace key to validate'}`
              : 'Independent model · Independent key'}
          </p>
        </div>
        {verified && (
          <p className="mt-2 text-[11px] text-slate-400">
            Last checked {new Date(item.setting!.validated_at!).toLocaleString()}
          </p>
        )}
        <button
          type="button"
          aria-expanded={editing}
          aria-controls={`configure-${item.id}`}
          onClick={() => {
            setEditing(!editing);
            setError('');
          }}
          disabled={saving}
          className={`mt-4 flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-sm font-semibold transition ${connected ? 'border border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
        >
          {editing ? 'Close editor' : connected ? 'Manage connection' : 'Set up this feature'}
          <span aria-hidden="true">{editing ? '−' : '→'}</span>
        </button>
      </div>
      {editing && (
        <form
          id={`configure-${item.id}`}
          className="border-t border-slate-100 bg-slate-50/60 p-5"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError('');
            try {
              await persist(item.id, {
                provider,
                model,
                keyMode,
                ...(keyMode === 'personal' && apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
              });
              setApiKey('');
              setShowKey(false);
              await onSaved(
                `${item.label} is connected. Your next operation will use this configuration.`,
              );
            } catch (err) {
              setError(getErrorMessage(err));
            } finally {
              setSaving(false);
            }
          }}
        >
          <fieldset disabled={saving} className="space-y-4">
            <label className="block text-xs font-semibold text-slate-600">
              Provider
              <select
                required
                aria-label={`${item.label} provider`}
                value={provider}
                className={inputStyle}
                onChange={(event) => {
                  setProvider(event.target.value);
                  setModel('');
                  setApiKey('');
                  setError('');
                }}
              >
                <option value="" disabled>
                  Select a provider
                </option>
                {catalogue.catalogue.providers.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Model
              <select
                required
                disabled={!provider}
                aria-label={`${item.label} model`}
                value={model}
                className={inputStyle}
                onChange={(event) => {
                  setModel(event.target.value);
                  setError('');
                }}
              >
                <option value="" disabled>
                  Select a model
                </option>
                {providerConfig?.models.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </select>
              {model && (
                <span className="mt-1.5 block font-normal leading-5 text-slate-500">
                  {providerConfig?.models.find((entry) => entry.id === model)?.description}
                </span>
              )}
            </label>
            <div
              className="grid grid-cols-2 gap-2"
              role="group"
              aria-label={`${item.label} key source`}
            >
              {(['personal', 'admin'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={keyMode === mode}
                  onClick={() => {
                    setKeyMode(mode);
                    setApiKey('');
                    setError('');
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-semibold ${keyMode === mode ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-slate-200 bg-white text-slate-500'}`}
                >
                  {mode === 'personal' ? 'My API key' : 'Platform key'}
                </button>
              ))}
            </div>
            {keyMode === 'personal' ? (
              <div>
                <label
                  className="block text-xs font-semibold text-slate-600"
                  htmlFor={`key-${item.id}`}
                >
                  {keepsKey ? 'Replace key (optional)' : 'API key'}
                </label>
                <div className="relative">
                  <input
                    id={`key-${item.id}`}
                    aria-label={`${item.label} API key`}
                    type={showKey ? 'text' : 'password'}
                    autoComplete="new-password"
                    spellCheck={false}
                    value={apiKey}
                    required={!keepsKey}
                    minLength={8}
                    maxLength={4096}
                    onChange={(event) => {
                      setApiKey(event.target.value);
                      setError('');
                    }}
                    className={`${inputStyle} pr-16 font-mono`}
                    placeholder={
                      keepsKey ? `Keep ${item.setting?.key_hint}` : 'Paste a key for this provider'
                    }
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    aria-label={showKey ? 'Hide API key' : 'Show API key'}
                    className="absolute right-3 top-4 text-xs font-semibold text-slate-500"
                  >
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
                {providerConfig && (
                  <a
                    href={providerConfig.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs font-medium text-teal-700 hover:underline"
                  >
                    Get a {providerConfig.label} key ↗
                  </a>
                )}
              </div>
            ) : (
              <p className="rounded-lg bg-white p-3 text-xs leading-5 text-slate-500">
                Uses Finlytix’s key for this provider. Validation will confirm whether it is
                available.
              </p>
            )}
            <p className="text-[11px] leading-5 text-slate-500">
              We send a small test prompt to this provider to check key access, model access and
              structured output. No financial data is sent. The check may use a small amount of your
              quota or credit.
            </p>
            <button
              disabled={!provider || !model}
              className="w-full rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-teal-800 disabled:opacity-40"
            >
              {saving ? 'Checking provider & model…' : 'Validate & save'}
            </button>
            {connected && (
              <button
                type="button"
                className="w-full text-xs text-slate-500 underline hover:text-red-600"
                onClick={async () => {
                  if (
                    !window.confirm(
                      `Disconnect ${item.label}? Its dedicated key will be removed. You can configure it again later.`,
                    )
                  )
                    return;
                  setSaving(true);
                  setError('');
                  try {
                    await persist(item.id, { clear: true });
                    await onSaved(`${item.label} disconnected. Configure it before the next use.`);
                  } catch (err) {
                    setError(getErrorMessage(err));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Disconnect this feature
              </button>
            )}
          </fieldset>
          {saving && (
            <p role="status" className="mt-3 text-xs text-teal-700">
              Checking your connection. This can take up to 20 seconds.
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mt-3 rounded-xl border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700"
            >
              {error}
            </p>
          )}
        </form>
      )}
    </article>
  );
}
export default function AiUseCaseSettings({
  catalogue,
}: {
  catalogue: AICatalogueResponse | null;
}) {
  const [items, setItems] = useState<UseCase[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  async function load() {
    const result = await apiGet<{ useCases: UseCase[] }>(
      endpoint,
      localStorage.getItem('token') || undefined,
    );
    setItems(result.useCases);
    setError('');
  }
  useEffect(() => {
    let active = true;
    apiGet<{ useCases: UseCase[] }>(endpoint, localStorage.getItem('token') || undefined)
      .then((result) => {
        if (active) setItems(result.useCases);
      })
      .catch((err) => {
        if (active) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const configured = items.filter((item) => item.setting).length;
  return (
    <section aria-label="AI settings by use case" className="space-y-5">
      <header className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-24 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl"
        />
        <p className="relative text-[10px] font-semibold uppercase tracking-[0.25em] text-teal-300">
          Your AI workspace
        </p>
        <div className="relative mt-3 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              The right model.
              <br />
              <span className="text-slate-400">For every task.</span>
            </h2>
            <p className="mt-3 max-w-md text-xs leading-6 text-slate-300">
              Connect each feature on your terms. Pick its provider, choose its model, and bring its
              own key. Every connection is independent.
            </p>
          </div>
          <div className="flex gap-6 sm:shrink-0">
            <div>
              <p className="text-2xl font-semibold">
                {configured}
                <span className="text-base text-slate-500"> / {items.length || 6}</span>
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">Configured</p>
            </div>
            <div>
              <p className="text-2xl font-semibold">
                {catalogue?.catalogue.providers.length || '—'}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-slate-400">Providers</p>
            </div>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-[11px] text-slate-300">
          <span>◈ Encrypted keys</span>
          <span>✓ Validate before saving</span>
          <span>↗ Active on the next operation</span>
        </div>
      </header>
      <div className="flex items-start gap-3 rounded-xl border border-teal-100 bg-teal-50/70 p-4 text-xs leading-5 text-teal-900">
        <span aria-hidden="true" className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal-500" />
        <p>
          <strong>No defaults. No restart.</strong> Saved changes apply to the next operation,
          including the next voice question. A request already running finishes with its original
          configuration.
        </p>
      </div>
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {loading && (
        <p role="status" className="p-6 text-center text-sm text-slate-500">
          Loading your connections…
        </p>
      )}
      {error && (
        <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
          {error}{' '}
          <button
            className="underline"
            onClick={() => void load().catch((err) => setError(getErrorMessage(err)))}
          >
            Retry
          </button>
        </div>
      )}
      {!catalogue && !loading && (
        <p className="text-sm text-slate-500">
          Provider catalogue unavailable. Refresh Settings to retry.
        </p>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {catalogue &&
          items.map((item) => (
            <UseCaseCard
              key={`${item.id}:${item.setting?.updated_at || 'empty'}`}
              item={item}
              catalogue={catalogue}
              onSaved={async (message) => {
                await load();
                setNotice(message);
              }}
            />
          ))}
      </div>
      <p className="px-1 text-[11px] leading-5 text-slate-500">
        A successful check confirms access at that moment; provider limits and availability can
        change. Voice input and playback use browser speech. Model choices here control answer
        generation.
      </p>
    </section>
  );
}
