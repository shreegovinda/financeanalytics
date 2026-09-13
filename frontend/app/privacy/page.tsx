import Link from 'next/link';
import { LEGAL_CONFIG } from '@/lib/legal';

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between text-sm">
          <Link href="/" className="text-indigo-700 hover:underline">
            ← Home
          </Link>
          <span className="text-slate-500">Version {LEGAL_CONFIG.policyVersion}</span>
        </div>

        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-600">Effective Date: {LEGAL_CONFIG.effectiveDate}</p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-700">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">1. Information We Collect</h2>
            <p className="mt-2">
              When using Finlytix, we collect the following types of information:
            </p>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>
                <strong>Account Details:</strong> Your name, email address, password hash, and
                mandatory international mobile number.
              </li>
              <li>
                <strong>Financial Statements:</strong> Uploaded bank statement files (PDF, XLSX) and
                extracted transaction records (date, description, amount, type, category).
              </li>
              <li>
                <strong>Merchant Bills:</strong> Invoices or receipts you attach to specific
                transactions.
              </li>
              <li>
                <strong>Assistant Interactions:</strong> Prompts and answers generated with the
                Finlytix assistant.
              </li>
              <li>
                <strong>Technical Records:</strong> Policy consent timestamps, IP address, and
                browser user agent for audit and account security.
              </li>
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">2. How Your Data Is Processed</h2>
            <p className="mt-2">
              Finlytix extracts transactions from statements so you can categorize spending and
              visualize cash flow. It does not connect directly to banking APIs or move funds.
            </p>
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 leading-normal">
              <strong>Current Security Status:</strong> Access to user records is enforced through
              authenticated user tokens and per-user database queries. Original statement contents
              and financial transactions are not currently encrypted at rest with application-level
              encryption against a database administrator. Application-level encryption with
              separately managed keys is on the active platform roadmap.
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">3. Third-Party AI Providers</h2>
            <p className="mt-2">
              Parsing statements and answering assistant queries utilizes configured AI providers
              (such as Anthropic and Google Gemini). Statements and questions sent to these
              providers are processed according to their respective enterprise terms and privacy
              controls. Personal API credentials support is planned.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">4. Retention and Deletion</h2>
            <p className="mt-2">
              You may delete individual statements and chat history at any time through the
              interface. Deleting a statement removes all associated transactions, drafts, line
              items, and uploaded files, unblocking that bank and month for future uploads. A full
              self-service account closure flow with legal retention policies is currently in
              development.
            </p>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">5. Contact Us</h2>
            <p className="mt-2">
              If you have privacy questions or concerns, contact our team at{' '}
              <a href={`mailto:${LEGAL_CONFIG.supportEmail}`} className="text-indigo-700 underline">
                {LEGAL_CONFIG.supportEmail}
              </a>
              .
            </p>
          </section>
        </div>

        <div className="mt-8 flex gap-4 text-xs text-slate-500">
          <Link href="/terms" className="hover:text-slate-800 underline">
            Terms of Service
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
