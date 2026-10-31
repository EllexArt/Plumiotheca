import '@testing-library/jest-dom/vitest';
// IndexedDB (histoires téléchargées, #35) : absent de jsdom.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { forgetOfflineStore } from '../features/offline/store';
import { auth, signedOut } from './render';

// Pages chargées à la demande : le premier chargement peut dépasser une seconde.
configure({ asyncUtilTimeout: 3000 });

// Keycloak n'est pas joignable en test : la connexion est simulée (voir render.tsx).
vi.mock('react-oidc-context', () => ({
  useAuth: () => auth,
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  signedOut();
  // Appareil neuf à chaque test.
  globalThis.indexedDB = new IDBFactory();
  forgetOfflineStore();
});

// jsdom n'implémente pas scrollTo (retour en haut à chaque page).
window.scrollTo = () => {};

// jsdom n'implémente pas matchMedia (thème du système, mouvement réduit).
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
