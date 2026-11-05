'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';
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
      className="ai-glow fixed bottom-6 right-6 z-50 flex cursor-pointer items-center gap-2 rounded-full bg-brand-gradient px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-95"
    >
      <Sparkles size={16} />
      <span>{t('askAi', 'Ask Finlytix')}</span>
    </Link>
  );
}
