'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  FileUp,
  KeyRound,
  Lock,
  Mic,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { ThemeQuickToggle } from '@/components/ThemeSelector';

const FEATURES: { title: string; body: string; Icon: LucideIcon }[] = [
  {
    title: 'Statements to insight',
    body: 'Upload bank statements as PDF or spreadsheet. Transactions are extracted, categorised and reconciled before they reach your ledger.',
    Icon: FileUp,
  },
  {
    title: 'Ask Finlytix',
    body: 'Ask about your spending in plain language, by typing or by voice, and get answers grounded in your own records with the sources shown.',
    Icon: Sparkles,
  },
  {
    title: 'Financial health score',
    body: 'A transparent five-part score for savings, discipline, runway, debt and stability, with concrete steps to improve it.',
    Icon: BarChart3,
  },
  {
    title: 'Bring your own AI',
    body: 'Choose the provider and model for each feature, or use your own API key. Keys are encrypted and never shown again.',
    Icon: KeyRound,
  },
  {
    title: 'Voice in your language',
    body: 'Talk to Finlytix hands-free in major Indian languages, using your browser for speech so recordings are never stored.',
    Icon: Mic,
  },
  {
    title: 'Private by design',
    body: 'Statements and keys are encrypted at rest. Export your data or delete your account whenever you choose.',
    Icon: ShieldCheck,
  },
];

const BARS = [38, 52, 44, 66, 58, 74, 62, 88];

function Preview() {
  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="absolute -inset-6 -z-10 rounded-[2rem] bg-brand-gradient-soft blur-2xl"
      />
      <div className="card overflow-hidden shadow-xl">
        <div className="flex items-center gap-1.5 border-b border-line px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 text-xs font-medium text-ink-4">Sample data</span>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="rounded-2xl bg-brand-gradient p-5 text-white shadow-md">
            <p className="text-xs font-medium uppercase tracking-wider text-white/70">
              Net balance
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">₹3,16,206</p>
            <div className="mt-4 flex h-14 items-end gap-1.5" aria-hidden="true">
              {BARS.map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t-md bg-white/30"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <p className="text-xs text-ink-3">Income</p>
              <p className="mt-1 text-lg font-semibold text-emerald-600">₹5,36,628</p>
            </div>
            <div className="rounded-xl border border-line bg-surface-2 p-4">
              <p className="text-xs text-ink-3">Expenses</p>
              <p className="mt-1 text-lg font-semibold text-rose-600">₹2,20,422</p>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4 shadow-xs">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-gradient text-white">
                <Sparkles size={15} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">How much did I spend on food?</p>
                <p className="mt-1 text-sm leading-6 text-ink-3">
                  You spent ₹4,200 on food this month, 12% less than last month.
                </p>
                <span className="mt-2 inline-flex rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                  Transactions
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      router.push('/dashboard');
    }
  }, [router]);

  return (
    <div className="min-h-screen">
      <header className="glass sticky top-0 z-40 border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-gradient font-bold text-white shadow-md ring-1 ring-white/20">
              F
            </span>
            <span className="text-[17px] font-semibold tracking-tight text-ink">Finlytix</span>
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3" aria-label="Site">
            <Link
              href="/help"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-3 transition-colors hover:text-ink sm:block"
            >
              Help
            </Link>
            <ThemeQuickToggle />
            <Link
              href="/auth"
              className="rounded-xl bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pb-24">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-ink-2 shadow-xs">
              <Lock size={12} className="text-brand-600" />
              Private personal finance analytics
            </span>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Understand your money, <span className="text-brand-gradient">just by asking</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-ink-2">
              Upload your bank statements and Finlytix organises every transaction, scores your
              financial health and answers questions about your spending, by text or by voice.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/auth"
                className="group inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:brightness-110"
              >
                Get started
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </Link>
              <Link
                href="/help"
                className="rounded-xl border border-line bg-surface px-6 py-3 text-sm font-semibold text-ink shadow-xs transition hover:border-line-strong hover:shadow-sm"
              >
                How it works
              </Link>
            </div>
            <p className="mt-5 text-sm text-ink-3">
              Statements and API keys are encrypted at rest. Export or delete your data any time.
            </p>
          </div>

          <Preview />
        </section>

        <section className="border-y border-line bg-surface/60">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
                Everything in one private workspace
              </h2>
              <p className="mt-4 text-ink-2">
                From raw statements to clear answers, without handing your data to a spreadsheet or
                a stranger.
              </p>
            </div>
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ title, body, Icon }) => (
                <li
                  key={title}
                  className="card group p-6 transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-gradient-soft text-brand-600 ring-1 ring-brand-500/15 transition-colors group-hover:bg-brand-gradient group-hover:text-white">
                    <Icon size={20} />
                  </span>
                  <h3 className="mt-5 text-base font-semibold text-ink">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink-3">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
          <div className="relative overflow-hidden rounded-3xl bg-brand-gradient px-6 py-12 text-center text-white shadow-xl sm:px-12">
            <div
              aria-hidden="true"
              className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl"
            />
            <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">
              Start with one statement
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-white/80">
              Create an account, upload a statement and ask your first question in minutes.
            </p>
            <Link
              href="/auth"
              className="relative mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-white/90"
            >
              Create your account
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-ink-3 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Finlytix</p>
          <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Link href="/help" className="hover:text-ink">
              Help &amp; FAQ
            </Link>
            <Link href="/privacy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
            <Link href="/cookies" className="hover:text-ink">
              Cookies
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
