'use client';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/Toast';
import AssistantLink from '@/components/AssistantLink';

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <ErrorBoundary>{children}</ErrorBoundary>
      <AssistantLink />
    </ToastProvider>
  );
}
