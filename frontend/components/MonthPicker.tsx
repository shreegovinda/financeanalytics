'use client';

import { useMemo, useState } from 'react';

export type MonthStatus = 'completed' | 'processing' | 'pending_review';

export interface TakenMonth {
  month: string;
  status: MonthStatus;
}

const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Year-at-a-glance month picker.
 *
 * A plain <input type="month"> gave no hint about which months were already
 * imported, so the only way to find out was to have an upload rejected. This
 * shows what is taken, what is still awaiting review, and what is in the future
 * before the user commits to a choice.
 */
export default function MonthPicker({
  value,
  onChange,
  taken,
  disabled = false,
}: {
  value: string;
  onChange: (month: string) => void;
  taken: TakenMonth[];
  disabled?: boolean;
}) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const [year, setYear] = useState(() => {
    if (value) {
      const parsed = Number(value.slice(0, 4));
      if (Number.isFinite(parsed)) return parsed;
    }
    return currentYear;
  });

  const takenByMonth = useMemo(() => {
    const map = new Map<string, MonthStatus>();
    for (const entry of taken) {
      map.set(entry.month, entry.status);
    }
    return map;
  }, [taken]);

  const takenThisYear = MONTH_LABELS.filter((_, index) =>
    takenByMonth.has(`${year}-${String(index + 1).padStart(2, '0')}`),
  ).length;

  return (
    <div className={disabled ? 'pointer-events-none opacity-50' : ''}>
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setYear((y) => y - 1)}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
          aria-label="Previous year"
        >
          ←
        </button>
        <div className="text-center">
          <span className="text-lg font-bold text-gray-900">{year}</span>
          <span className="ml-2 text-xs text-gray-500">
            {takenThisYear > 0 ? `${takenThisYear} already imported` : 'nothing imported yet'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setYear((y) => y + 1)}
          disabled={year >= currentYear}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next year"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {MONTH_LABELS.map((label, index) => {
          const monthValue = `${year}-${String(index + 1).padStart(2, '0')}`;
          const status = takenByMonth.get(monthValue);
          const isFuture = year > currentYear || (year === currentYear && index > currentMonth);
          const isSelected = value === monthValue;
          const isBlocked = Boolean(status) || isFuture;

          return (
            <button
              key={monthValue}
              type="button"
              disabled={isBlocked}
              onClick={() => onChange(monthValue)}
              title={
                status === 'pending_review'
                  ? 'Awaiting your review'
                  : status
                    ? 'Already imported'
                    : isFuture
                      ? 'Not yet available'
                      : `Select ${label} ${year}`
              }
              className={[
                'relative rounded-lg border px-3 py-2.5 text-sm font-medium transition',
                isSelected
                  ? 'border-blue-600 bg-blue-600 text-white shadow-sm'
                  : status === 'pending_review'
                    ? 'cursor-not-allowed border-amber-200 bg-amber-50 text-amber-700'
                    : status
                      ? 'cursor-not-allowed border-green-200 bg-green-50 text-green-700'
                      : isFuture
                        ? 'cursor-not-allowed border-gray-100 bg-gray-50 text-gray-300'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-blue-400 hover:bg-blue-50',
              ].join(' ')}
            >
              {label}
              {status === 'completed' && <span className="ml-1 text-xs">✓</span>}
              {status === 'pending_review' && <span className="ml-1 text-xs">●</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <Legend swatch="bg-green-100 border-green-200" label="Already imported" />
        <Legend swatch="bg-amber-100 border-amber-200" label="Awaiting review" />
        <Legend swatch="bg-white border-gray-300" label="Available" />
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded border ${swatch}`} />
      {label}
    </span>
  );
}
