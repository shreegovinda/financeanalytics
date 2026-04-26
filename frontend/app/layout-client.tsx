'use client';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/Toast';
import AiProviderSelect from '@/components/AiProviderSelect';

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ErrorBoundary>
        <AiProviderSelect />
        {children}
      </ErrorBoundary>
    </ToastProvider>
  );
}
