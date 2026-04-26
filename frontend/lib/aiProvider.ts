export const AI_PROVIDER_STORAGE_KEY = 'aiProvider';

export function getSelectedAiProvider(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return localStorage.getItem(AI_PROVIDER_STORAGE_KEY);
}

export function setSelectedAiProvider(providerId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(AI_PROVIDER_STORAGE_KEY, providerId);
}

export function getAiProviderHeaders(): Record<string, string> {
  const provider = getSelectedAiProvider();
  return provider ? { 'X-AI-Provider': provider } : {};
}
