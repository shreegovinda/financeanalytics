'use client';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/Toast';

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ErrorBoundary>{children}</ErrorBoundary>
    </ToastProvider>
  );
}
