import Link from 'next/link';
import faqs from '../../../backend/data/faqs.json';

export default function HelpPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-indigo-700">
          Finlytix home
        </Link>
        <h1 className="mt-6 text-3xl font-bold">Help and frequently asked questions</h1>
        <p className="mt-3 text-slate-600">
          How the application works, what happens to your data, and what is still planned.
        </p>
        <div className="mt-6 space-y-3">
          {faqs.map((faq) => (
            <details
              key={faq.id}
              id={faq.id}
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <summary className="cursor-pointer font-semibold focus-visible:outline-indigo-600">
                {faq.question}
              </summary>
              <p className="mt-3 whitespace-normal break-words leading-7 text-slate-700">
                {faq.answer}
              </p>
            </details>
          ))}
        </div>
        <p className="mt-8 text-sm text-slate-600">
          You can also{' '}
          <Link href="/assistant" className="text-indigo-700 underline">
            ask the Finlytix chatbot
          </Link>{' '}
          about these topics after signing in.
        </p>
      </div>
    </main>
  );
}
