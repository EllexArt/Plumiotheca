import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_PALETTE, isPalette, type PaletteId } from './palettes';

/** Choix de la personne ; « system » suit le réglage clair / sombre de l'appareil. */
export type ThemeChoice = 'light' | 'dark' | 'system';

// Mêmes clés que public/theme.js, qui applique le choix avant le premier affichage.
const KEY = 'plumiotheca.theme';
const PALETTE_KEY = 'plumiotheca.ambiance';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Stockage indisponible : le choix vaut pour cette visite seulement.
  }
}

function readChoice(): ThemeChoice {
  const value = read(KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

function readPalette(): PaletteId {
  const value = read(PALETTE_KEY);
  return value && isPalette(value) ? value : DEFAULT_PALETTE;
}

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && darkQuery().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

interface ThemeContext {
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
  /** Ambiance (#77) : palette de tout le site. */
  palette: PaletteId;
  setPalette: (palette: PaletteId) => void;
}

const Context = createContext<ThemeContext | null>(null);

/**
 * Apparence sur cet appareil : mode clair / sombre et ambiance (#77), gardés pour les
 * prochaines visites (public/theme.js les applique avant le premier affichage). Le compte
 * en garde aussi une copie : voir app/appearance.tsx.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readChoice);
  const [palette, setPaletteState] = useState<PaletteId>(readPalette);

  useEffect(() => {
    apply(choice);
    if (choice !== 'system') return;
    const query = darkQuery();
    const onChange = () => apply('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [choice]);

  useEffect(() => {
    document.documentElement.dataset.palette = palette;
  }, [palette]);

  const setChoice = useCallback((next: ThemeChoice) => {
    write(KEY, next === 'system' ? null : next);
    setChoiceState(next);
  }, []);

  const setPalette = useCallback((next: PaletteId) => {
    write(PALETTE_KEY, next === DEFAULT_PALETTE ? null : next);
    setPaletteState(next);
  }, []);

  return <Context value={{ choice, setChoice, palette, setPalette }}>{children}</Context>;
}

export function useTheme(): ThemeContext {
  const context = useContext(Context);
  if (!context) throw new Error('useTheme hors de ThemeProvider');
  return context;
}
