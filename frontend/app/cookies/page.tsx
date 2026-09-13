import Link from 'next/link';
import { LEGAL_CONFIG } from '@/lib/legal';

export default function CookiePolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between text-sm">
          <Link href="/" className="text-indigo-700 hover:underline">
            ← Home
          </Link>
          <span className="text-slate-500">Version {LEGAL_CONFIG.policyVersion}</span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Cookie & Local Storage Policy
        </h1>
        <p className="mt-2 text-sm text-slate-600">Effective Date: {LEGAL_CONFIG.effectiveDate}</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">1. Essential Local Storage</h2>
            <p className="mt-2">
              Finlytix uses browser local storage strictly for functionality necessary to provide
              the service:
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                <strong>Authentication Tokens:</strong> A signed JWT token is held in local storage
                to keep you securely authenticated across browser sessions.
              </li>
              <li>
                <strong>User Profile Cache:</strong> Basic display data (name, email, phone) is
                cached to render UI headers swiftly without blocking page rendering.
              </li>
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              2. No Tracking or Advertising Cookies
            </h2>
            <p className="mt-2">
              We do not place third-party advertising cookies, behavioural retargeting beacons, or
              cross-site trackers on your device. Any future optional telemetry will require
              explicit, separate opt-in consent.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">3. Managing Local Storage</h2>
            <p className="mt-2">
              Logging out via the application clears stored session tokens immediately. You can also
              clear stored data at any time via your browser settings.
            </p>
          </section>
        </div>

        <div className="mt-8 flex gap-4 text-xs text-slate-500">
          <Link href="/terms" className="hover:text-slate-800 underline">
            Terms of Service
          </Link>
          <span>·</span>
          <Link href="/privacy" className="hover:text-slate-800 underline">
            Privacy Policy
          </Link>
          <span>·</span>
          <Link href="/help" className="hover:text-slate-800 underline">
            Help & FAQs
          </Link>
        </div>
      </div>
    </main>
  );
}
