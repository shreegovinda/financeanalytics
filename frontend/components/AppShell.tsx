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
    <ul className="space-y-0.5">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname?.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors duration-150',
                isActive
                  ? 'bg-brand-gradient-soft text-ink shadow-xs ring-1 ring-brand-500/15'
                  : 'text-ink-3 hover:bg-surface-3/70 hover:text-ink',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-indicator"
                  className="absolute -left-4 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-brand-gradient"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
                  isActive
                    ? 'bg-brand-gradient text-white shadow-sm'
                    : 'bg-surface-3/60 text-ink-3 group-hover:text-ink',
                )}
              >
                <Icon size={15} />
              </span>
              <span>{item.label}</span>

              {item.highlight && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-bold tracking-wide text-accent-700">
                  <Sparkles size={9} />
                  AI
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={cn(
          'relative flex items-center justify-center rounded-xl bg-brand-gradient font-bold text-white shadow-md ring-1 ring-white/20',
          size === 'md' ? 'h-9 w-9 text-[15px]' : 'h-8 w-8 text-sm',
        )}
      >
        F
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-surface" />
      </div>
      <span className="text-[17px] font-semibold tracking-tight text-ink">Finlytix</span>
    </div>
  );
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const user = useSyncExternalStore(subscribeToStoredUser, readStoredUser, serverUser);

  // The landing and auth pages are public and render without the app shell
  const isAuthPage =
    pathname === '/' || pathname?.startsWith('/auth') || pathname?.startsWith('/verify-email');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    router.push('/auth');
  };

  if (isAuthPage) {
    return <>{children}</>;
  }

  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="flex h-screen w-full overflow-hidden text-ink selection:bg-brand-200">
      {/* Mobile Header */}
      <div className="glass fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between border-b border-line px-4 md:hidden">
        <BrandMark size="sm" />
        <div className="flex items-center gap-2">
          <ThemeQuickToggle />
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            className="cursor-pointer rounded-lg p-2 text-ink-3 transition-colors hover:bg-surface-3"
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
            onClick={closeMenu}
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm md:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={cn(
          'glass fixed inset-y-0 left-0 z-50 flex h-full w-64 flex-col border-r border-line transition-transform duration-300 ease-in-out md:static md:translate-x-0',
          isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-5">
          <BrandMark />
          <div className="hidden md:block">
            <ThemeQuickToggle />
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-4 py-4" aria-label="Primary">
          <div>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4">
              Workspace
            </p>
            <NavLinks items={NAV_ITEMS} pathname={pathname} onNavigate={closeMenu} />
          </div>

          <div>
            <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-4">
              Account
            </p>
            <NavLinks items={SECONDARY_NAV_ITEMS} pathname={pathname} onNavigate={closeMenu} />
          </div>
        </nav>

        <div className="m-3 rounded-2xl border border-line bg-surface-2/70 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-bold text-white shadow-sm">
              {user?.name?.charAt(0)?.toUpperCase() || <UserIcon size={16} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{user?.name || 'User'}</p>
              <p className="truncate text-xs text-ink-3">{user?.email || 'email@example.com'}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
              className="cursor-pointer rounded-lg p-2 text-ink-4 transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="relative h-screen flex-1 overflow-y-auto pt-14 md:pt-0">
        <div className="mx-auto h-full max-w-7xl p-4 sm:p-6 lg:p-8">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="h-full"
          >
            {children}
          </motion.div>
        </div>
      </main>
    </div>
  );
}
