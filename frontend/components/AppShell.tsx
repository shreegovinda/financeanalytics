'use client';

import React, { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  PieChart,
  ArrowRightLeft,
  FileText,
  Sparkles,
  Settings,
  Activity,
  HelpCircle,
  LogOut,
  Menu,
  X,
  User as UserIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThemeQuickToggle } from '@/components/ThemeSelector';

interface AppShellProps {
  children: React.ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  highlight?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Analytics', href: '/analytics', icon: PieChart },
  { label: 'Transactions', href: '/transactions', icon: ArrowRightLeft },
  { label: 'Statements', href: '/statements', icon: FileText },
  { label: 'AI Assistant', href: '/assistant', icon: Sparkles, highlight: true },
];

const SECONDARY_NAV_ITEMS: NavItem[] = [
  { label: 'Activity Log', href: '/activity', icon: Activity },
  { label: 'Help & FAQ', href: '/help', icon: HelpCircle },
  { label: 'Settings', href: '/settings', icon: Settings },
];

interface ShellUser {
  name: string;
  email: string;
}

// The signed-in user is kept in localStorage by the auth flow, so it is external
// state. Snapshots are cached against the raw string to keep the reference
// stable between renders.
let cachedUserRaw: string | null = null;
let cachedUser: ShellUser | null = null;

function readStoredUser(): ShellUser | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem('user');
  } catch {
    return null;
  }

  if (raw !== cachedUserRaw) {
    cachedUserRaw = raw;
    try {
      cachedUser = raw ? (JSON.parse(raw) as ShellUser) : null;
    } catch {
      cachedUser = null;
    }
  }
  return cachedUser;
}

function subscribeToStoredUser(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  return () => window.removeEventListener('storage', onStoreChange);
}

const serverUser = () => null;

function NavLinks({
  items,
  pathname,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string | null;
  onNavigate: () => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 relative overflow-hidden',
                isActive
                  ? 'text-brand-700 bg-brand-50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80',
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute left-0 top-0 bottom-0 w-1 bg-brand-600 rounded-r-full"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
              <Icon
                size={18}
                className={cn(
                  'transition-colors',
                  isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600',
                  item.highlight && !isActive && 'text-amber-500',
                )}
              />
              <span className="relative z-10">{item.label}</span>

              {item.highlight && (
                <span className="ml-auto flex h-5 items-center rounded-full bg-gradient-to-r from-amber-200 to-amber-100 px-2 text-[10px] font-bold text-amber-700">
                  NEW
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const user = useSyncExternalStore(subscribeToStoredUser, readStoredUser, serverUser);

  // Do not wrap Auth pages
  const isAuthPage = pathname?.startsWith('/auth') || pathname?.startsWith('/verify-email');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/auth');
  };

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen w-full bg-[#f4f7fb] dark:bg-[#090d16] text-slate-900 dark:text-slate-100 overflow-hidden selection:bg-brand-200 selection:text-brand-900">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white/85 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 z-50 flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold shadow-sm">
            F
          </div>
          <span className="font-bold text-slate-900 dark:text-white tracking-tight">Finlytix</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeQuickToggle />
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        className={cn(
          'fixed md:static inset-y-0 left-0 z-50 flex h-full w-72 flex-col border-r border-slate-200/70 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/85 backdrop-blur-3xl transition-transform duration-300 ease-in-out md:translate-x-0',
          isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-5 pt-6 md:pt-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-bold shadow-sm ring-1 ring-brand-900/5">
              F
            </div>
            <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              Finlytix
            </span>
          </div>
          <ThemeQuickToggle />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-6 scrollbar-none">
          <div className="space-y-6">
            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                Main Menu
              </p>
              <NavLinks
                items={NAV_ITEMS}
                pathname={pathname}
                onNavigate={() => setIsMobileMenuOpen(false)}
              />
            </div>

            <div>
              <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                Preferences
              </p>
              <NavLinks
                items={SECONDARY_NAV_ITEMS}
                pathname={pathname}
                onNavigate={() => setIsMobileMenuOpen(false)}
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200/60 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-800/40 m-2 rounded-2xl">
          <div className="flex items-center gap-3 px-2 py-1 mb-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 dark:bg-brand-950/60 text-brand-700 dark:text-brand-300 font-bold border border-brand-200 dark:border-brand-800">
              {user?.name?.charAt(0) || <UserIcon size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {user?.name || 'User'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {user?.email || 'email@example.com'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 dark:hover:text-red-400 group cursor-pointer"
          >
            <LogOut
              size={16}
              className="text-slate-400 group-hover:text-red-500 transition-colors"
            />
            Sign Out
          </button>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <main className="flex-1 h-screen overflow-y-auto bg-[#f4f7fb] dark:bg-[#090d16] pt-16 md:pt-0 relative">
        <div className="mx-auto max-w-7xl h-full p-4 sm:p-6 lg:p-8">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="h-full"
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
