'use client';

import React, { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ThemePalette = 'classic' | 'emerald' | 'violet' | 'sunset' | 'crimson' | 'slate';

export interface PaletteInfo {
  id: ThemePalette;
  name: string;
  tagline: string;
  accent: string;
  gradient: string;
  dotColor: string;
}

export const THEME_PALETTES: PaletteInfo[] = [
  {
    id: 'classic',
    name: 'Finlytix Sapphire',
    tagline: 'Classic banking blue & deep indigo',
    accent: '#2563eb',
    gradient: 'from-blue-600 to-indigo-700',
    dotColor: 'bg-blue-600',
  },
  {
    id: 'emerald',
    name: 'Emerald Wealth',
    tagline: 'Prosperity forest green & fresh mint',
    accent: '#059669',
    gradient: 'from-emerald-600 to-teal-700',
    dotColor: 'bg-emerald-600',
  },
  {
    id: 'violet',
    name: 'Cyber Amethyst',
    tagline: 'Electric violet & neo-fintech purple',
    accent: '#7c3aed',
    gradient: 'from-violet-600 to-purple-700',
    dotColor: 'bg-violet-600',
  },
  {
    id: 'sunset',
    name: 'Sunset Amber',
    tagline: 'Warm golden copper & rich amber',
    accent: '#d97706',
    gradient: 'from-amber-600 to-orange-700',
    dotColor: 'bg-amber-600',
  },
  {
    id: 'crimson',
    name: 'Crimson Ruby',
    tagline: 'Bold luxury ruby & velvet rose',
    accent: '#e11d48',
    gradient: 'from-rose-600 to-pink-700',
    dotColor: 'bg-rose-600',
  },
  {
    id: 'slate',
    name: 'Nordic Slate',
    tagline: 'Minimalist titanium & sleek monochrome',
    accent: '#475569',
    gradient: 'from-slate-700 to-zinc-800',
    dotColor: 'bg-slate-700',
  },
];

interface ThemeContextValue {
  mode: ThemeMode;
  resolvedMode: 'light' | 'dark';
  palette: ThemePalette;
  setMode: (mode: ThemeMode) => void;
  setPalette: (palette: ThemePalette) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_MODE_KEY = 'finlytix_theme_mode';
const STORAGE_PALETTE_KEY = 'finlytix_theme_palette';

const THEME_MODES: ThemeMode[] = ['light', 'dark', 'system'];

// Same-tab writes need an explicit nudge: the `storage` event only fires in the
// other tabs. Subscribers get both.
const storeListeners = new Set<() => void>();

function emitStoreChange() {
  for (const listener of storeListeners) listener();
}

function subscribeToStoredPreferences(onStoreChange: () => void) {
  const onExternalWrite = (event: StorageEvent) => {
    if (event.key === STORAGE_MODE_KEY) memoryMode = null;
    if (event.key === STORAGE_PALETTE_KEY) memoryPalette = null;
    onStoreChange();
  };

  storeListeners.add(onStoreChange);
  window.addEventListener('storage', onExternalWrite);
  return () => {
    storeListeners.delete(onStoreChange);
    window.removeEventListener('storage', onExternalWrite);
  };
}

let memoryMode: ThemeMode | null = null;
let memoryPalette: ThemePalette | null = null;

function readStoredMode(): ThemeMode {
  if (memoryMode) return memoryMode;
  try {
    const saved = localStorage.getItem(STORAGE_MODE_KEY) as ThemeMode | null;
    if (saved && THEME_MODES.includes(saved)) return saved;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); fall through.
  }
  return 'system';
}

function readStoredPalette(): ThemePalette {
  if (memoryPalette) return memoryPalette;
  try {
    const saved = localStorage.getItem(STORAGE_PALETTE_KEY) as ThemePalette | null;
    if (saved && THEME_PALETTES.some((p) => p.id === saved)) return saved;
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); fall through.
  }
  return 'classic';
}

function subscribeToSystemScheme(onStoreChange: () => void) {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  mediaQuery.addEventListener('change', onStoreChange);
  return () => mediaQuery.removeEventListener('change', onStoreChange);
}

function readSystemIsDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

// The server cannot know either preference. These defaults match the values the
// inline script in app/layout.tsx assumes before it reads localStorage.
const serverMode = (): ThemeMode => 'system';
const serverPalette = (): ThemePalette => 'classic';
const serverSystemIsDark = () => false;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useSyncExternalStore(subscribeToStoredPreferences, readStoredMode, serverMode);
  const palette = useSyncExternalStore(
    subscribeToStoredPreferences,
    readStoredPalette,
    serverPalette,
  );
  const systemIsDark = useSyncExternalStore(
    subscribeToSystemScheme,
    readSystemIsDark,
    serverSystemIsDark,
  );

  const resolvedMode: 'light' | 'dark' = useMemo(() => {
    if (mode === 'system') {
      return systemIsDark ? 'dark' : 'light';
    }
    return mode;
  }, [mode, systemIsDark]);

  // Synchronize DOM attributes
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;

    // Apply or remove dark class
    if (resolvedMode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Apply palette attribute
    root.setAttribute('data-theme', palette);
    root.setAttribute('data-mode', resolvedMode);

    // Meta theme-color update for browser headers if present
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', resolvedMode === 'dark' ? '#090d16' : '#f4f7fb');
    }
  }, [resolvedMode, palette]);

  const setMode = (newMode: ThemeMode) => {
    memoryMode = newMode;
    try {
      localStorage.setItem(STORAGE_MODE_KEY, newMode);
    } catch {
      // Preference cannot be persisted; it still applies for this session.
    }
    emitStoreChange();
  };

  const setPalette = (newPalette: ThemePalette) => {
    memoryPalette = newPalette;
    try {
      localStorage.setItem(STORAGE_PALETTE_KEY, newPalette);
    } catch {
      // Preference cannot be persisted; it still applies for this session.
    }
    emitStoreChange();
  };

  const toggleMode = () => {
    const nextMode: ThemeMode = resolvedMode === 'dark' ? 'light' : 'dark';
    setMode(nextMode);
  };

  return (
    <ThemeContext.Provider
      value={{
        mode,
        resolvedMode,
        palette,
        setMode,
        setPalette,
        toggleMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
