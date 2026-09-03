'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * Minimal theme mechanism — the project had none and no theme library is worth
 * adding for this. A `data-theme` attribute on <html>, persisted to
 * localStorage, defaulting to the system preference.
 */

type Theme = 'light' | 'dark';

const STORAGE_KEY = '4fg-admin-theme';

const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {}
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Starts 'light' so server and first client render agree; the effect below
  // corrects it before paint-relevant interaction.
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const initial: Theme =
      stored === 'light' || stored === 'dark'
        ? stored
        : window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // Private browsing or blocked storage — the toggle still works for this
        // session, it just will not be remembered.
      }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
