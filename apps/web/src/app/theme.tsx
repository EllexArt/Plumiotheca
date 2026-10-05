import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/** Choix de la personne ; « system » suit le réglage clair / sombre de l'appareil. */
export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'plumiotheca.theme';
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function readChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && darkQuery().matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

interface ThemeContext {
  choice: ThemeChoice;
  setChoice: (choice: ThemeChoice) => void;
}

const Context = createContext<ThemeContext | null>(null);

/** Thème clair / sombre (les ambiances de lecture viendront avec #77). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setState] = useState<ThemeChoice>(readChoice);

  useEffect(() => {
    apply(choice);
    if (choice !== 'system') return;
    const query = darkQuery();
    const onChange = () => apply('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [choice]);

  const setChoice = useCallback((next: ThemeChoice) => {
    try {
      if (next === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      // Stockage indisponible : le choix vaut pour cette visite seulement.
    }
    setState(next);
  }, []);

  return <Context value={{ choice, setChoice }}>{children}</Context>;
}

export function useTheme(): ThemeContext {
  const context = useContext(Context);
  if (!context) throw new Error('useTheme hors de ThemeProvider');
  return context;
}
