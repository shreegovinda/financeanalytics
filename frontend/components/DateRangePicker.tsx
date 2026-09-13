'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { formatDate } from '@/lib/date';

interface DateRangePickerProps {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  onChange: (start: string, end: string) => void;
  maxDate?: string;
  minDate?: string;
  className?: string;
  placeholder?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function toIsoString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIso(isoStr?: string): Date | null {
  if (!isoStr || !/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return null;
  const [y, m, d] = isoStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function DateRangePicker({
  startDate,
  endDate,
  onChange,
  maxDate,
  minDate,
  className = '',
  placeholder = 'Select date range',
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Active viewing month in calendar
  const today = useMemo(() => new Date(), []);
  const initialViewDate = useMemo(() => {
    return parseIso(endDate) || parseIso(startDate) || today;
  }, [endDate, startDate, today]);

  const [viewYear, setViewYear] = useState(initialViewDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialViewDate.getMonth());

  // Staged selection before apply
  const [prevProps, setPrevProps] = useState({ start: startDate, end: endDate });
  const [stagedStart, setStagedStart] = useState(startDate);
  const [stagedEnd, setStagedEnd] = useState(endDate);

  if (prevProps.start !== startDate || prevProps.end !== endDate) {
    setPrevProps({ start: startDate, end: endDate });
    setStagedStart(startDate);
    setStagedEnd(endDate);
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const daysInMonth = useMemo(() => {
    return new Date(viewYear, viewMonth + 1, 0).getDate();
  }, [viewYear, viewMonth]);

  const firstDayOfWeek = useMemo(() => {
    return new Date(viewYear, viewMonth, 1).getDay();
  }, [viewYear, viewMonth]);

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const applyPreset = (daysBack: number | 'thisMonth' | 'lastMonth' | 'thisYear') => {
    const now = new Date();
    const todayIso = toIsoString(now);

    if (daysBack === 'thisMonth') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const startIso = toIsoString(start);
      setStagedStart(startIso);
      setStagedEnd(todayIso);
      onChange(startIso, todayIso);
      setIsOpen(false);
      return;
    }

    if (daysBack === 'lastMonth') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      const startIso = toIsoString(start);
      const endIso = toIsoString(end);
      setStagedStart(startIso);
      setStagedEnd(endIso);
      onChange(startIso, endIso);
      setIsOpen(false);
      return;
    }

    if (daysBack === 'thisYear') {
      const start = new Date(now.getFullYear(), 0, 1);
      const startIso = toIsoString(start);
      setStagedStart(startIso);
      setStagedEnd(todayIso);
      onChange(startIso, todayIso);
      setIsOpen(false);
      return;
    }

    if (typeof daysBack === 'number') {
      const start = new Date();
      start.setDate(start.getDate() - daysBack);
      const startIso = toIsoString(start);
      setStagedStart(startIso);
      setStagedEnd(todayIso);
      onChange(startIso, todayIso);
      setIsOpen(false);
    }
  };

  const handleDayClick = (day: number) => {
    const clickedIso = toIsoString(new Date(viewYear, viewMonth, day));

    if (!stagedStart || (stagedStart && stagedEnd)) {
      // Start a new range
      setStagedStart(clickedIso);
      setStagedEnd('');
    } else {
      // Second click: finish range
      if (clickedIso < stagedStart) {
        setStagedEnd(stagedStart);
        setStagedStart(clickedIso);
      } else {
        setStagedEnd(clickedIso);
      }
    }
  };

  const handleApply = () => {
    if (stagedStart && stagedEnd) {
      onChange(stagedStart, stagedEnd);
    } else if (stagedStart && !stagedEnd) {
      onChange(stagedStart, stagedStart);
    }
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setStagedStart('');
    setStagedEnd('');
    onChange('', '');
    setIsOpen(false);
  };

  const displayText = useMemo(() => {
    if (startDate && endDate) {
      if (startDate === endDate) return formatDate(startDate);
      return `${formatDate(startDate)} – ${formatDate(endDate)}`;
    }
    if (startDate) return `${formatDate(startDate)} – ...`;
    return placeholder;
  }, [startDate, endDate, placeholder]);

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center justify-between gap-3 w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-800 shadow-sm transition hover:border-blue-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
        aria-label="Select date range"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 truncate">
          <span className="text-gray-400 text-base">📅</span>
          <span
            className={startDate ? 'font-medium text-gray-900 truncate' : 'text-gray-400 truncate'}
          >
            {displayText}
          </span>
        </div>

        <div className="flex items-center gap-1.5 ml-2 shrink-0">
          {startDate && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="rounded-full p-1 text-xs text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer"
              title="Clear date range"
            >
              ✕
            </span>
          )}
          <span className="text-gray-400 text-xs">▼</span>
        </div>
      </button>

      {/* Popover Dropdown */}
      {isOpen && (
        <div className="absolute left-0 z-50 mt-2 w-[340px] sm:w-[380px] rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl backdrop-blur-xl animate-fade-in">
          {/* Quick Presets */}
          <div className="mb-3 flex flex-wrap gap-1.5 border-b border-gray-100 pb-3">
            <button
              type="button"
              onClick={() => applyPreset(0)}
              className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => applyPreset(7)}
              className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition cursor-pointer"
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => applyPreset(30)}
              className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition cursor-pointer"
            >
              Last 30 Days
            </button>
            <button
              type="button"
              onClick={() => applyPreset('thisMonth')}
              className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition cursor-pointer"
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => applyPreset('lastMonth')}
              className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition cursor-pointer"
            >
              Last Month
            </button>
            <button
              type="button"
              onClick={() => applyPreset('thisYear')}
              className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition cursor-pointer"
            >
              This Year
            </button>
          </div>

          {/* Calendar Month Header */}
          <div className="flex items-center justify-between mb-3 px-1">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition cursor-pointer"
              aria-label="Previous month"
            >
              ◀
            </button>
            <div className="font-semibold text-sm text-gray-900">
              {MONTHS[viewMonth]} {viewYear}
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition cursor-pointer"
              aria-label="Next month"
            >
              ▶
            </button>
          </div>

          {/* Weekdays Row */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-400 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="h-8 w-8" />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dateStr = toIsoString(new Date(viewYear, viewMonth, day));

              const isStart = stagedStart === dateStr;
              const isEnd = stagedEnd === dateStr;
              const inRange =
                (stagedStart && stagedEnd && dateStr > stagedStart && dateStr < stagedEnd) ||
                (stagedStart &&
                  !stagedEnd &&
                  hoverDate &&
                  dateStr > stagedStart &&
                  dateStr <= hoverDate);

              const isDisabled = (maxDate && dateStr > maxDate) || (minDate && dateStr < minDate);

              return (
                <button
                  key={day}
                  type="button"
                  disabled={Boolean(isDisabled)}
                  onClick={() => handleDayClick(day)}
                  onMouseEnter={() => setHoverDate(dateStr)}
                  onMouseLeave={() => setHoverDate(null)}
                  className={`h-8 w-8 rounded-lg font-medium transition cursor-pointer flex items-center justify-center ${
                    isDisabled
                      ? 'text-gray-300 cursor-not-allowed'
                      : isStart || isEnd
                        ? 'bg-blue-600 text-white font-bold shadow-sm'
                        : inRange
                          ? 'bg-blue-100 text-blue-800 rounded-none'
                          : 'text-gray-700 hover:bg-blue-50 hover:text-blue-600'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Staged Range Preview & Actions */}
          <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-xs">
            <div className="text-gray-500 truncate max-w-[180px]">
              {stagedStart ? (
                <span>
                  {formatDate(stagedStart)} {stagedEnd ? `– ${formatDate(stagedEnd)}` : '– ...'}
                </span>
              ) : (
                'Choose start & end dates'
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg px-2.5 py-1 text-gray-600 hover:bg-gray-100 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={!stagedStart}
                className="rounded-lg bg-blue-600 px-3 py-1 font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-40 transition cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
