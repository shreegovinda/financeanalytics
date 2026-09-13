import Link from 'next/link';
import { LEGAL_CONFIG } from '@/lib/legal';

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between text-sm">
          <Link href="/" className="text-indigo-700 hover:underline">
            ← Home
          </Link>
          <span className="text-slate-500">Version {LEGAL_CONFIG.policyVersion}</span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Terms of Service</h1>
        <p className="mt-2 text-sm text-slate-600">Effective Date: {LEGAL_CONFIG.effectiveDate}</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">1. Nature of the Service</h2>
            <p className="mt-2">
              Finlytix is a statement analysis and personal budgeting visualization application
              provided by {LEGAL_CONFIG.companyName}. Finlytix is not a financial institution, bank,
              payment gateway, or registered investment adviser. It does not provide real-time bank
              feeds or execute money transfers.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              2. Review and Accuracy Responsibility
            </h2>
            <p className="mt-2">
              Extracted statement figures and categorizations are generated with machine learning
              and heuristic parsers. You are responsible for reviewing statement drafts before
              confirming and importing them into your records. Finlytix is not liable for errors in
              financial assessments, tax estimates, or third-party interpretations of your data.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">3. User Accounts & Security</h2>
            <p className="mt-2">
              You agree to provide accurate registration information, including your legal name,
              verified email address, and valid international mobile number. You must maintain the
              confidentiality of your password and credentials.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">4. Acceptable Use</h2>
            <p className="mt-2">
              You may upload only bank statements and bills that you own or have explicit legal
              authorization to process. You may not upload malicious files, attempt to circumvent
              rate limits or tenancy boundaries, or reverse-engineer server infrastructure.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">5. Inquiries</h2>
            <p className="mt-2">
              Questions regarding these Terms should be directed to{' '}
              <a href={`mailto:${LEGAL_CONFIG.supportEmail}`} className="text-indigo-700 underline">
                {LEGAL_CONFIG.supportEmail}
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-8 flex gap-4 text-xs text-slate-500">
          <Link href="/privacy" className="hover:text-slate-800 underline">
            Privacy Policy
          </Link>
          <span>·</span>
          <Link href="/cookies" className="hover:text-slate-800 underline">
            Cookie Policy
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
