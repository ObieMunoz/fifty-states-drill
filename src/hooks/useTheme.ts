import { useEffect, useState } from 'react';
import type { Theme } from '../types';

/**
 * Kept out of the progress blob on purpose: that key is still read by the
 * pre-React version's shape, and a display preference is not progress.
 */
export const THEME_KEY = 'fiftyStatesDrill.theme';

export const THEMES: Theme[] = ['system', 'light', 'dark'];

export const THEME_LABELS: Record<Theme, string> = {
  system: 'Auto',
  light: 'Light',
  dark: 'Dark',
};

const isTheme = (v: unknown): v is Theme => (THEMES as unknown[]).includes(v);

export function loadTheme(): Theme {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (isTheme(raw)) return raw;
  } catch {
    // Private mode or blocked storage: follow the system.
  }
  return 'system';
}

/**
 * Writes the `data-theme` attribute that tokens.css keys off, and remembers
 * the choice. `system` removes the attribute rather than setting a value, so
 * the prefers-color-scheme block takes over again.
 */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Nothing to do: the choice just will not survive a reload.
    }
  }, [theme]);

  return [theme, setTheme];
}
