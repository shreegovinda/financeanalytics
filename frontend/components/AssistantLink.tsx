'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from '@/lib/translations';

export default function AssistantLink() {
  const path = usePathname();
  const { t } = useTranslation();
  if (
    !['/dashboard', '/analytics', '/transactions', '/settings', '/statements', '/activity'].some(
      (p) => path === p || path.startsWith(p + '/'),
    )
  )
    return null;
  return (
    <Link
      href="/assistant"
      className="fixed bottom-6 right-6 z-50 rounded-full bg-indigo-700 px-5 py-3 font-semibold text-white shadow-lg hover:bg-indigo-800 transition hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
    >
      <span>💬</span>
      <span>{t('askAi', 'Ask Finlytix')}</span>
    </Link>
  );
}
