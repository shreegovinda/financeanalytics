'use client';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/Toast';
import AssistantLink from '@/components/AssistantLink';
import { AppShell } from '@/components/AppShell';
import { ThemeProvider } from '@/lib/theme';

export default function RootLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ErrorBoundary>
          <AppShell>{children}</AppShell>
        </ErrorBoundary>
        <AssistantLink />
      </ToastProvider>
    </ThemeProvider>
  );
}
