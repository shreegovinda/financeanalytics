'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  HelpCircle,
} from 'lucide-react';
import { apiGet } from '@/lib/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PillarData {
  name: string;
  score: number;
  weight: number;
  displayValue: string;
  status: 'good' | 'fair' | 'warning';
  benchmark: string;
  description: string;
}

interface ActionableWin {
  title: string;
  impact: string;
  description: string;
}

interface HealthScoreResponse {
  hasData: boolean;
  overallScore: number;
  tier: 'Optimal' | 'Strong' | 'Moderate' | 'Vulnerable';
  label: string;
  color: 'emerald' | 'blue' | 'amber' | 'rose';
  trend: string | null;
  message?: string;
  summary: {
    totalIncome: number;
    totalExpenses: number;
    totalInvestments: number;
    netSavings: number;
    monthsAnalyzed: number;
  };
  pillars: {
    savingsRate: PillarData;
    discretionaryDiscipline: PillarData;
    emergencyRunway: PillarData;
    debtBurden: PillarData;
    spendingStability: PillarData;
  };
  actionableWins: ActionableWin[];
}

const TIER_CONFIG = {
  Optimal: {
    bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    ring: 'stroke-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    gradient: 'from-emerald-500 to-teal-600',
    badge:
      'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  Strong: {
    bg: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
    ring: 'stroke-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
    gradient: 'from-blue-500 to-indigo-600',
    badge: 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950/40 dark:text-blue-300',
  },
  Moderate: {
    bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    ring: 'stroke-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
    gradient: 'from-amber-500 to-orange-600',
    badge: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300',
  },
  Vulnerable: {
    bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
    ring: 'stroke-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
    gradient: 'from-rose-500 to-red-600',
    badge: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-950/40 dark:text-rose-300',
  },
};

export default function FinlytixHealthScore() {
  const [data, setData] = useState<HealthScoreResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchScore() {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await apiGet<HealthScoreResponse>(
          `${API_BASE_URL}/api/analytics/health-score`,
          token,
        );
        if (isMounted && res) {
          setData(res);
        }
      } catch (err) {
        console.error('Failed to load Finlytix Health Score:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    void fetchScore();

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800 animate-pulse">
        <div className="flex items-center justify-between mb-6">
          <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded"></div>
          <div className="h-6 w-24 bg-slate-200 dark:bg-slate-800 rounded-full"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-44 bg-slate-100 dark:bg-slate-800/60 rounded-xl"></div>
          <div className="h-44 md:col-span-2 bg-slate-100 dark:bg-slate-800/60 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (!data || !data.hasData) {
    return (
      <div className="relative overflow-hidden rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 p-6 backdrop-blur">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Finlytix Health Score (FinScore)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Upload your bank statement to unlock your 5-pillar mathematical financial score.
              </p>
            </div>
          </div>
          <Link
            href="/statements"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            Upload Statement <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  const tier = data.tier || 'Moderate';
  const tierStyle = TIER_CONFIG[tier] || TIER_CONFIG.Moderate;
  const score = data.overallScore;

  // SVG Gauge calculations
  const radius = 64;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (score / 100) * circumference;

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-sm ring-1 ring-slate-100 dark:ring-slate-800 transition-all">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-indigo-700 text-white shadow-sm">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Finlytix Health Score
              </h2>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                FinScore
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Deterministic 5-pillar algorithmic evaluation of your cash flow and habits
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFormulaModal(!showFormulaModal)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            title="How is FinScore calculated?"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">How it works</span>
          </button>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${tierStyle.badge}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current"></span>
            {tier} Standing
          </span>
        </div>
      </div>

      {/* Main Grid: Gauge on Left, 5 Pillars on Right */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Radial Dial Hero */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center rounded-2xl bg-gradient-to-b from-slate-50 to-white dark:from-slate-800/40 dark:to-slate-900 p-6 text-center ring-1 ring-slate-100 dark:ring-slate-800/80">
          <div className="relative flex items-center justify-center">
            <svg className="w-44 h-44 -rotate-90 transform" viewBox="0 0 160 160">
              {/* Background Ring */}
              <circle
                cx="80"
                cy="80"
                r={radius}
                className="stroke-slate-100 dark:stroke-slate-800"
                strokeWidth="12"
                fill="transparent"
              />
              {/* Animated Progress Ring */}
              <motion.circle
                cx="80"
                cy="80"
                r={radius}
                className={tierStyle.ring}
                strokeWidth="12"
                strokeDasharray={circumference}
                initial={{ strokeDashoffset: circumference }}
                animate={{ strokeDashoffset: progressOffset }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>

            {/* Center Numeric Score */}
            <div className="absolute flex flex-col items-center justify-center text-center">
              <motion.span
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
                className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white"
              >
                {score}
              </motion.span>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                out of 100
              </span>
            </div>
          </div>

          {/* Trend badge */}
          {data.trend && (
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
              {data.trend.startsWith('+') ? (
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              ) : data.trend.startsWith('-') ? (
                <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
              ) : (
                <Info className="w-3.5 h-3.5 text-blue-500" />
              )}
              <span>{data.trend}</span>
            </div>
          )}

          <div className="mt-4 border-t border-slate-100 dark:border-slate-800 pt-3 w-full text-xs text-slate-500 dark:text-slate-400">
            Based on {data.summary.monthsAnalyzed} month(s) of verified bank transactions
          </div>
        </div>

        {/* 5 Pillars Breakdown */}
        <div className="lg:col-span-8 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-1">
            <span>Financial Pillar</span>
            <span>Current Status • Target</span>
          </div>

          {Object.entries(data.pillars).map(([key, pillar]) => {
            const isExpanded = expandedPillar === key;
            const statusColor =
              pillar.status === 'good'
                ? 'bg-emerald-500'
                : pillar.status === 'fair'
                  ? 'bg-amber-500'
                  : 'bg-rose-500';

            return (
              <div
                key={key}
                onClick={() => setExpandedPillar(isExpanded ? null : key)}
                className="cursor-pointer rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3.5 transition-all hover:bg-slate-100 dark:hover:bg-slate-800 ring-1 ring-slate-100 dark:ring-slate-800/80"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`}></span>
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                      {pillar.name}
                    </span>
                    <span className="text-[10px] font-medium text-slate-400 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                      Weight {pillar.weight}%
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {pillar.displayValue}
                    </span>
                    <span className="text-[11px] text-slate-400 hidden sm:inline">
                      ({pillar.benchmark})
                    </span>
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white min-w-[28px] text-right">
                      {pillar.score}
                    </span>
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Micro Progress Bar */}
                <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${statusColor}`}
                    style={{ width: `${Math.min(100, pillar.score)}%` }}
                  ></div>
                </div>

                {/* Expandable Explanation */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-400 flex flex-col gap-1"
                    >
                      <p>{pillar.description}</p>
                      <p className="text-[11px] font-medium text-brand-600 dark:text-brand-400">
                        Pillar Target: {pillar.benchmark}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actionable Wins Section */}
      {data.actionableWins && data.actionableWins.length > 0 && (
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-brand-600 dark:text-brand-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Actionable Steps to Boost Your FinScore
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.actionableWins.map((win, idx) => (
              <div
                key={idx}
                className="flex flex-col justify-between rounded-xl bg-brand-50/50 dark:bg-brand-950/20 p-4 border border-brand-100 dark:border-brand-900/40"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      {win.title}
                    </h4>
                    <span className="shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 text-[10px] font-extrabold">
                      {win.impact}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {win.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Explanatory Formula Modal */}
      <AnimatePresence>
        {showFormulaModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl ring-1 ring-slate-200 dark:ring-slate-800 text-left"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-brand-600" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    How FinScore is Calculated
                  </h3>
                </div>
                <button
                  onClick={() => setShowFormulaModal(false)}
                  className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-h-[70vh] overflow-y-auto pr-1">
                <p>
                  The <strong>Finlytix Health Score (FinScore)</strong> is a 100% deterministic,
                  audit-grade financial health metric that evaluates 5 foundational pillars of
                  personal finance:
                </p>

                <div className="space-y-2 border-l-2 border-brand-500 pl-3">
                  <div>
                    <strong>1. Savings Rate (30% Weight)</strong>: Net retained earnings divided by
                    total income. Target benchmark is ≥ 20%.
                  </div>
                  <div>
                    <strong>2. Discretionary Discipline (25% Weight)</strong>: Wants (dining,
                    shopping, OTT) relative to total debits, based on the 50/30/20 rule. Target is ≤
                    30%.
                  </div>
                  <div>
                    <strong>3. Emergency Runway (20% Weight)</strong>: Months of essential living
                    expenses (rent, utilities, groceries, debt) covered by surplus liquid reserves.
                    Benchmark is 3 to 6 months.
                  </div>
                  <div>
                    <strong>4. Debt & Fixed Commitments (15% Weight)</strong>: Debt-to-Income (DTI)
                    ratio measuring loan EMIs and credit card obligations. Benchmark is ≤ 15%.
                  </div>
                  <div>
                    <strong>5. Spending Stability (10% Weight)</strong>: Month-over-month
                    predictability and variance of outlays.
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 p-3">
                  <div className="font-semibold text-slate-900 dark:text-white mb-1">
                    Deterministic Precision vs Black-Box AI:
                  </div>
                  All arithmetic and scoring functions execute programmatically in pure SQL and
                  TypeScript. AI is used solely to parse cryptic bank descriptions and offer
                  personalized suggestions in the Chat Assistant.
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 text-right">
                <button
                  onClick={() => setShowFormulaModal(false)}
                  className="rounded-xl bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700 transition"
                >
                  Got it
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
