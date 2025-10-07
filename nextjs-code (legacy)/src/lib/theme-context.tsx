'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_STORAGE_KEY = 'flip-safe-theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');

  // Apply theme class to <html> immediately to avoid FOUC
  useEffect(() => {
    try {
      const stored = (typeof window !== 'undefined' &&
        localStorage.getItem(THEME_STORAGE_KEY)) as Theme | null;
      const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      const initial: Theme = stored || (prefersDark ? 'dark' : 'light');
      setThemeState(initial);
      document.documentElement.classList.toggle('dark', initial === 'dark');
    } catch (e) {
      // ignore
    }
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, t);
      } catch (e) {
        // Ignore persistence errors (private mode, etc.)
      }
    }
    document.documentElement.classList.toggle('dark', t === 'dark');
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const value: ThemeContextValue = {
    theme,
    isDark: theme === 'dark',
    toggleTheme,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
