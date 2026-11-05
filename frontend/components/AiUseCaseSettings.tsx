import React, { useEffect, useState } from 'react';
import { apiGet, apiPut, getErrorMessage } from '@/lib/api';
import type { AICatalogueResponse } from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';

const endpoint = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/ai/use-cases`;

interface UseCaseSetting {
  provider: string;
  model: string;
  key_mode: 'admin' | 'personal';
  key_hint: string | null;
  updated_at: string;
  validated_at: string;
}

interface UseCase {
  id: string;
  label: string;
  description: string;
  setting: UseCaseSetting | null;
}

type UseCasePayload =
  | {
      provider: string;
      model: string;
      keyMode: 'admin' | 'personal';
      apiKey?: string;
    }
  | { clear: true };

async function persist(id: string, payload: UseCasePayload) {
  await apiPut(`${endpoint}/${id}`, payload, localStorage.getItem('token') || undefined, {
    timeout: 60000,
    retries: 0,
  });
}

function UseCaseEditor({
  item,
  catalogue,
  onSaved,
  onCancel,
}: {
  item: UseCase;
  catalogue: AICatalogueResponse;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const existing = item.setting;
  const [provider, setProvider] = useState(existing?.provider || '');
  const [model, setModel] = useState(
    existing?.model === 'gemini-2.5-flash' ? 'gemini-3.8-flash' : existing?.model || '',
  );
  const [keyMode, setKeyMode] = useState<'admin' | 'personal'>(existing?.key_mode || 'admin');
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const providerConfig = catalogue.catalogue.providers.find((p) => p.id === provider);
  const inputStyle =
    'mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:ring-brand-500';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await persist(item.id, {
        provider,
        model,
        keyMode,
        ...(keyMode === 'personal' && apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(`Disconnect ${item.label}?`)) return;
    setSaving(true);
    try {
      await persist(item.id, { clear: true });
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  };

  return (
    <motion.form
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      onSubmit={handleSave}
      className="overflow-hidden border-t border-slate-100 bg-slate-50/50 px-4 py-4 sm:px-6"
    >
      <fieldset disabled={saving} className="space-y-4">
        {error && <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</div>}

        <div className="flex gap-2 p-1 bg-slate-200/50 rounded-xl w-fit">
          <button
            type="button"
            onClick={() => {
              setKeyMode('admin');
              setApiKey('');
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${keyMode === 'admin' ? 'bg-white shadow-sm text-brand-700' : 'text-slate-500'}`}
          >
            System Provider
          </button>
          <button
            type="button"
            onClick={() => setKeyMode('personal')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${keyMode === 'personal' ? 'bg-white shadow-sm text-brand-700' : 'text-slate-500'}`}
          >
            User-Defined Key
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-slate-700">
            Provider
            <select
              required
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value);
                setModel('');
              }}
              className={inputStyle}
            >
              <option value="" disabled>
                Select Provider
              </option>
              {catalogue.catalogue.providers
                .filter((entry) => keyMode === 'personal' || entry.adminKeyConfigured)
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label}
                  </option>
                ))}
            </select>
          </label>

          <label className="block text-xs font-semibold text-slate-700">
            Model
            <select
              required
              disabled={!provider}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={inputStyle}
            >
              <option value="" disabled>
                Select Model
              </option>
              {providerConfig?.models.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {keyMode === 'personal' && provider && (
          <label className="block text-xs font-semibold text-slate-700">
            {existing?.key_hint ? 'Update API Key (optional)' : 'API Key'}
            <input
              type="password"
              required={!existing?.key_hint}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className={inputStyle}
              placeholder={existing?.key_hint || 'sk-...'}
            />
          </label>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
          >
            {saving ? 'Validating connection & saving…' : 'Save Configuration'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl bg-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-300"
          >
            Cancel
          </button>
          {existing && (
            <button
              type="button"
              onClick={handleDisconnect}
              className="ml-auto text-xs font-medium text-red-500 hover:text-red-700"
            >
              Disconnect
            </button>
          )}
        </div>
      </fieldset>
    </motion.form>
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
  const [editingId, setEditingId] = useState<string | null>(null);

  // Bumped after a save so the list refetches.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const fetchUseCases = async () => {
      try {
        const result = await apiGet<{ useCases: UseCase[] }>(
          endpoint,
          localStorage.getItem('token') || undefined,
        );
        if (cancelled) return;
        setItems(result.useCases);
      } catch (err) {
        if (cancelled) return;
        setError(getErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchUseCases();
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  if (loading) return <div className="animate-pulse h-64 bg-slate-100 rounded-3xl" />;
  if (!catalogue) return <p className="text-sm text-slate-500">Catalogue unavailable.</p>;

  const configuredCount = items.filter((i) => i.setting).length;

  return (
    <section aria-label="AI settings by use case" className="max-w-4xl space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Feature Intelligence</h2>
          <p className="text-sm text-slate-500">
            Configure dedicated AI models for specific platform features.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 border border-brand-100">
          <span className="flex h-2 w-2 rounded-full bg-brand-500" />
          {configuredCount} / {items.length} Active
        </div>
      </div>

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => {
          const isEditing = editingId === item.id;
          const isConfigured = !!item.setting;
          const providerDetails = item.setting
            ? catalogue.catalogue.providers.find((p) => p.id === item.setting?.provider)
            : null;

          return (
            <div
              key={item.id}
              className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-100 overflow-hidden flex flex-col"
            >
              <div className="flex items-center justify-between p-4 sm:p-5 flex-1">
                <div className="min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{item.label}</h3>
                    {isConfigured ? (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                        ON
                      </span>
                    ) : (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                        OFF
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2">{item.description}</p>

                  {isConfigured && providerDetails && (
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-brand-600 bg-brand-50 w-fit px-2 py-0.5 rounded-full">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      {providerDetails.label}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setEditingId(isEditing ? null : item.id)}
                  className={`shrink-0 rounded-full h-8 w-8 flex items-center justify-center transition-colors ${isEditing ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    {isEditing ? (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    ) : (
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                    )}
                  </svg>
                </button>
              </div>

              <AnimatePresence>
                {isEditing && (
                  <UseCaseEditor
                    item={item}
                    catalogue={catalogue}
                    onCancel={() => setEditingId(null)}
                    onSaved={() => {
                      setEditingId(null);
                      setReloadToken((token) => token + 1);
                    }}
                  />
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
