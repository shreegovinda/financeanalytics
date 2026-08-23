'use client';

import type { ReactElement } from 'react';
import { useRouter } from 'next/navigation';

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
  label = 'Back',
  variant = 'light',
  className = '',
}: BackButtonProps): ReactElement {
  const router = useRouter();

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
    variant === 'dark' ? 'text-blue-200/80 hover:text-white' : 'text-gray-500 hover:text-gray-900';

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label={label}
      className={`group -ml-1 inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors cursor-pointer ${variantClasses} ${className}`}
    >
      <svg
        className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  );
}
