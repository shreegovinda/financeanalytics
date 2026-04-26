'use client';

import type { ReactElement } from 'react';
import { useRouter } from 'next/navigation';

interface BackButtonProps {
  fallbackHref?: string;
  label?: string;
  variant?: 'light' | 'dark';
  className?: string;
}

export default function BackButton({
  fallbackHref = '/dashboard',
  label = 'Go Back',
  variant = 'light',
  className = '',
}: BackButtonProps): ReactElement {
  const router = useRouter();

  const handleBack = (): void => {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  };

  const variantClasses =
    variant === 'dark'
      ? 'text-blue-100 hover:text-white bg-white/10 hover:bg-white/15 border-white/20'
      : 'text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border-gray-200';

  return (
    <button
      type="button"
      onClick={handleBack}
      className={`inline-flex items-center gap-2 border px-4 py-2 rounded-lg transition cursor-pointer ${variantClasses} ${className}`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      {label}
    </button>
  );
}
