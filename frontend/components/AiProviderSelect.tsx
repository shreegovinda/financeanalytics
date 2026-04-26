'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiGet, getErrorMessage } from '@/lib/api';
import {
  AI_PROVIDER_STORAGE_KEY,
  getSelectedAiProvider,
  setSelectedAiProvider,
} from '@/lib/aiProvider';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface AiProvider {
  id: string;
  label: string;
  model: string;
  configured: boolean;
}

interface ProvidersResponse {
  selectedProvider: string;
  providers: AiProvider[];
}

export default function AiProviderSelect() {
  const pathname = usePathname();
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [selectedProvider, setSelectedProviderState] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const hasToken = typeof window !== 'undefined' && Boolean(localStorage.getItem('token'));

  useEffect(() => {
    if (!hasToken) {
      return;
    }

    async function fetchProviders() {
      try {
        const data = await apiGet<ProvidersResponse>(`${API_BASE_URL}/api/ai/providers`);
        const configuredProviders = data.providers.filter((provider) => provider.configured);
        const storedProvider = getSelectedAiProvider();
        const nextProvider =
          configuredProviders.find((provider) => provider.id === data.selectedProvider)?.id ||
          configuredProviders.find((provider) => provider.id === storedProvider)?.id ||
          configuredProviders[0]?.id ||
          '';

        setProviders(data.providers);
        setSelectedProviderState(nextProvider);
        if (nextProvider && nextProvider !== storedProvider) {
          setSelectedAiProvider(nextProvider);
        }
      } catch (err) {
        console.error('Failed to load AI providers:', getErrorMessage(err));
        setError('AI models unavailable');
      } finally {
        setIsLoading(false);
      }
    }

    void fetchProviders();
  }, [hasToken, pathname]);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key === AI_PROVIDER_STORAGE_KEY) {
        setSelectedProviderState(event.newValue || '');
      }
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  if (!hasToken || pathname === '/auth' || pathname === '/' || isLoading) {
    return null;
  }

  const configuredCount = providers.filter((provider) => provider.configured).length;

  return (
    <div className="fixed top-3 right-3 z-40 rounded-xl border border-gray-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur">
      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
        <span>AI Model</span>
        <select
          value={selectedProvider}
          onChange={(event) => {
            setSelectedProviderState(event.target.value);
            setSelectedAiProvider(event.target.value);
          }}
          disabled={configuredCount === 0}
          className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 shadow-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
        >
          {configuredCount === 0 ? (
            <option value="">{error || 'No API key configured'}</option>
          ) : (
            providers.map((provider) => (
              <option key={provider.id} value={provider.id} disabled={!provider.configured}>
                {provider.label}
                {provider.configured ? '' : ' (not configured)'}
              </option>
            ))
          )}
        </select>
      </label>
    </div>
  );
}
