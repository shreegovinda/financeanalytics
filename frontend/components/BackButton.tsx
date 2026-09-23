'use client';

import type { ReactElement } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/translations';

interface BackButtonProps {
  fallbackHref?: string;
  label?: string;
  variant?: 'light' | 'dark';
  className?: string;
}

/**
 * Secondary navigation, so it is styled as a quiet text control rather than a
 * bordered button competing with the page's primary actions.
 *
 * Only belongs on pages nested under the dashboard. The landing page and the
 * auth flow are entry points with nowhere to go back to.
 */
export default function BackButton({
  fallbackHref = '/dashboard',
  label,
  variant = 'light',
  className = '',
}: BackButtonProps): ReactElement {
  const router = useRouter();
  const { t } = useTranslation();
  const displayLabel = label || t('back', 'Back');

  const handleBack = (): void => {
    // history.length > 1 is true for a fresh tab too, so the fallback still
    // matters when someone opens a deep link directly.
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  };

  const variantClasses =
    variant === 'dark'
      ? 'bg-white/15 hover:bg-white/25 active:bg-white/30 text-white border border-white/25 shadow-xs hover:shadow backdrop-blur-md'
      : 'bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 shadow-2xs hover:shadow-xs';

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={displayLabel}
      className={`group inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-sm font-medium transition-all active:scale-95 cursor-pointer ${variantClasses} ${className}`}
    >
      <svg
        className="h-4 w-4 transition-transform group-hover:-translate-x-1"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M15 19l-7-7 7-7" />
      </svg>
      <span>{displayLabel}</span>
    </button>
  );
}
