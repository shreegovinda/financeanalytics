'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import faqsData from '../../../backend/data/faqs.json';

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const faqs = faqsData as FAQ[];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = new Set(faqs.map((f) => f.category));
    return ['All', ...Array.from(cats)].sort();
  }, []);

  const filteredFaqs = useMemo(() => {
    return faqs.filter((faq) => {
      const matchesCategory = activeCategory === 'All' || faq.category === activeCategory;
      const matchesSearch =
        faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
        faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [searchQuery, activeCategory]);

  return (
    <main className="animate-fade-in pb-12">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-ink sm:text-5xl">
            How can we help?
          </h1>
          <p className="mt-4 text-lg text-ink-2">
            Search our knowledge base or browse categories to learn about Finlytix.
          </p>
        </div>

        <div className="mt-10 max-w-2xl mx-auto">
          <div className="relative group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-ink-4 group-focus-within:text-brand-600 transition-colors">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search for answers (e.g., 'export data', 'AI privacy')"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-2xl border-2 border-line bg-surface/90 py-4 pl-12 pr-4 text-ink shadow-sm backdrop-blur transition-all placeholder:text-ink-4 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10"
            />
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 cursor-pointer ${
                activeCategory === cat
                  ? 'bg-brand-600 text-white shadow-md scale-105'
                  : 'bg-surface border border-line text-ink-2 hover:bg-surface-2 hover:border-line-strong'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="mt-12 space-y-4">
          {filteredFaqs.length === 0 ? (
            <div className="text-center py-12 rounded-3xl bg-surface/50 border border-line border-dashed">
              <span className="text-3xl">🔍</span>
              <h3 className="mt-4 font-semibold text-ink">No results found</h3>
              <p className="mt-1 text-sm text-ink-3">
                We couldn&apos;t find any FAQs matching &quot;{searchQuery}&quot;.
              </p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 text-brand-600 font-medium hover:underline cursor-pointer"
              >
                Clear search
              </button>
            </div>
          ) : (
            filteredFaqs.map((faq) => (
              <div
                key={faq.id}
                className={`group overflow-hidden rounded-2xl border transition-all duration-300 ${
                  expandedId === faq.id
                    ? 'border-brand-200 bg-surface shadow-lg'
                    : 'border-line bg-surface/80 shadow-sm hover:border-brand-300 hover:bg-surface'
                }`}
              >
                <button
                  onClick={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                  className="flex w-full items-center justify-between p-5 sm:p-6 text-left cursor-pointer focus:outline-none"
                >
                  <div className="pr-4">
                    <span className="mb-2 inline-block rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-600">
                      {faq.category}
                    </span>
                    <h3
                      className={`text-base font-semibold sm:text-lg transition-colors ${
                        expandedId === faq.id
                          ? 'text-brand-900'
                          : 'text-ink group-hover:text-brand-700'
                      }`}
                    >
                      {faq.question}
                    </h3>
                  </div>
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-transform duration-300 ${
                      expandedId === faq.id
                        ? 'bg-brand-100 text-brand-700 rotate-180'
                        : 'bg-surface-3 text-ink-3'
                    }`}
                  >
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                <div
                  className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out ${
                    expandedId === faq.id ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="px-5 pb-5 sm:px-6 sm:pb-6 text-sm sm:text-base leading-relaxed text-ink-2 border-t border-line-soft pt-4">
                    {faq.answer}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-16 rounded-3xl bg-gradient-to-br from-brand-950 to-slate-900 p-8 text-center sm:p-12 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none"></div>
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 rounded-full bg-brand-500/10 blur-3xl pointer-events-none"></div>

          <span className="text-4xl">✨</span>
          <h2 className="mt-4 text-2xl font-bold text-white">Still have questions?</h2>
          <p className="mt-2 text-white/70">
            You can ask the Finlytix AI Copilot about any of these topics, or specific questions
            about your finances.
          </p>
          <div className="mt-6">
            <Link
              href="/assistant"
              className="inline-flex items-center gap-2 rounded-2xl bg-surface px-6 py-3 font-semibold text-brand-900 shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl hover:bg-brand-50 cursor-pointer"
            >
              <span>Ask Finlytix Chatbot</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
