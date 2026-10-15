'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Sun, Moon, Monitor, Check, Sparkles } from 'lucide-react';
import { useTheme, THEME_PALETTES, ThemeMode } from '@/lib/theme';

export function ThemeStudio() {
  const { mode, palette, setMode, setPalette } = useTheme();

  const modeOptions: { id: ThemeMode; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      id: 'light',
      label: 'Light Mode',
      icon: <Sun className="w-5 h-5 text-amber-500" />,
      desc: 'Crisp, clean high-contrast appearance for day',
    },
    {
      id: 'dark',
      label: 'Dark Mode',
      icon: <Moon className="w-5 h-5 text-indigo-400" />,
      desc: 'Sleek, eye-friendly deep navy & obsidian for night',
    },
    {
      id: 'system',
      label: 'System Sync',
      icon: <Monitor className="w-5 h-5 text-slate-500" />,
      desc: 'Automatically matches your operating system setting',
    },
  ];

  return (
    <div className="space-y-8">
      {/* ── Mode Selection ── */}
      <div>
        <div className="mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
            Appearance Mode
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Choose whether Finlytix appears in light, dark, or synchronizes with your device.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {modeOptions.map((opt) => {
            const isSelected = mode === opt.id;
            return (
              <motion.button
                key={opt.id}
                type="button"
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setMode(opt.id)}
                className={`relative flex flex-col items-start p-5 rounded-2xl border-2 text-left transition-all cursor-pointer shadow-sm ${
                  isSelected
                    ? 'border-brand-500 bg-brand-50/50 dark:bg-brand-950/30 ring-2 ring-brand-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {isSelected && (
                  <span className="absolute top-3.5 right-3.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                )}
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 mb-3">
                  {opt.icon}
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {opt.label}
                </span>
                <span className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {opt.desc}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Accent Color Palettes ── */}
      <div>
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand-500" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Color Palette &amp; Accent Themes
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Personalize buttons, charts, highlights, active tabs, and financial indicators
            throughout the app.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {THEME_PALETTES.map((p) => {
            const isSelected = palette === p.id;
            return (
              <motion.button
                key={p.id}
                type="button"
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setPalette(p.id)}
                className={`relative flex flex-col p-4 rounded-2xl border-2 text-left transition-all cursor-pointer shadow-sm ${
                  isSelected
                    ? 'border-brand-500 bg-brand-50/40 dark:bg-brand-950/20 ring-2 ring-brand-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                {isSelected && (
                  <span className="absolute top-3.5 right-3.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white shadow-sm">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                )}

                {/* Color preview swatch bar */}
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="w-5 h-5 rounded-full shadow-sm ring-2 ring-white dark:ring-slate-900"
                    style={{ backgroundColor: p.accent }}
                  />
                  <div className={`h-2.5 flex-1 rounded-full bg-gradient-to-r ${p.gradient}`} />
                </div>

                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {p.name}
                </span>
                <span className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {p.tagline}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ── Live Theme Preview Card ── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900/60 dark:to-slate-900 p-6 shadow-sm">
        <span className="text-[11px] font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400 block mb-2">
          ✨ Live Interface Preview
        </span>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
          Here is how metrics, badges, and controls look with your current <strong>{mode}</strong>{' '}
          mode and <strong>{THEME_PALETTES.find((p) => p.id === palette)?.name}</strong> theme:
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Stat Card Preview */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-4 shadow-sm">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Total Balance
            </span>
            <p className="text-xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">
              ₹3,45,200.00
            </p>
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-brand-50 dark:bg-brand-950/50 px-2 py-0.5 text-[11px] font-bold text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
              ↑ 12.4% this month
            </span>
          </div>

          {/* Action Button Preview */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-4 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Primary Actions
            </span>
            <div className="space-y-2">
              <button
                type="button"
                className="w-full rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-700 transition"
              >
                + New Transaction
              </button>
              <button
                type="button"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                View Analytics
              </button>
            </div>
          </div>

          {/* Assistant Preview */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 p-4 shadow-sm flex flex-col justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Assistant Highlight
            </span>
            <div className="rounded-lg bg-gradient-to-r from-brand-600 to-brand-800 p-3 text-white shadow-sm mt-1">
              <p className="text-xs font-bold">Ask Finlytix</p>
              <p className="text-[11px] text-brand-100/90 mt-0.5">
                AI powered insights styled in your chosen colors.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact quick toggle for headers and sidebars
 */
export function ThemeQuickToggle() {
  const { mode, resolvedMode, toggleMode, palette, setPalette } = useTheme();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <div ref={containerRef} className="relative inline-block">
      <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200/80 dark:border-slate-700 shadow-2xs">
        {/* Toggle Light/Dark */}
        <button
          type="button"
          onClick={toggleMode}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
          title={`Switch to ${resolvedMode === 'dark' ? 'Light' : 'Dark'} mode (current: ${mode})`}
          aria-label="Toggle theme mode"
        >
          {resolvedMode === 'dark' ? (
            <Sun className="w-4 h-4 text-amber-400" />
          ) : (
            <Moon className="w-4 h-4 text-slate-600" />
          )}
        </button>

        {/* Palette Popover Trigger */}
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer flex items-center gap-1"
          title="Change theme palette"
          aria-label="Change color palette"
        >
          <span
            className="w-3.5 h-3.5 rounded-full border border-white/60 shadow-xs"
            style={{
              backgroundColor: THEME_PALETTES.find((p) => p.id === palette)?.accent || '#2563eb',
            }}
          />
        </button>
      </div>

      {/* Palette Dropdown Menu */}
      {menuOpen && (
        <div className="absolute right-0 mt-2 w-52 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
          <p className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Theme Palette
          </p>
          <div className="space-y-1 mt-1">
            {THEME_PALETTES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPalette(p.id);
                  setMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  palette === p.id
                    ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.accent }} />
                  <span>{p.name}</span>
                </div>
                {palette === p.id && <Check className="w-3 h-3 text-brand-600" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
