'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
export default function AssistantLink() {
  const path = usePathname();
  if (
    !['/dashboard', '/analytics', '/transactions', '/settings', '/statements'].some(
      (p) => path === p || path.startsWith(p + '/'),
    )
  )
    return null;
  return (
    <Link
      href="/assistant"
      className="fixed bottom-6 right-6 z-50 rounded-full bg-indigo-700 px-5 py-3 font-semibold text-white shadow-lg hover:bg-indigo-800"
    >
      Ask Finlytix
    </Link>
  );
}
