/**
 * Configuration lue au démarrage : `/config.js` (fichier, pas de script en ligne : compatible
 * avec une CSP stricte) définit `window.PLUMIOTHECA`. En production, nginx le génère à partir
 * des variables d'environnement du conteneur : une même image sert tous les environnements.
 * En développement, `public/config.js` est vide et les valeurs viennent de Vite (VITE_*) ou
 * des valeurs par défaut.
 */
interface RuntimeConfig {
  /** Realm Keycloak (émetteur des jetons). */
  oidcAuthority?: string;
  oidcClientId?: string;
  /** Adresse de l'API (« /api » si elle est servie sur la même origine). */
  apiUrl?: string;
}

declare global {
  interface Window {
    PLUMIOTHECA?: RuntimeConfig;
  }
}

/** Valeur vide (variable non fournie au conteneur) : comme absente. */
const value = (v: string | undefined) => (v?.trim() ? v.trim() : undefined);

const runtime: RuntimeConfig = typeof window === 'undefined' ? {} : (window.PLUMIOTHECA ?? {});

export const config = {
  oidcAuthority:
    value(runtime.oidcAuthority) ??
    value(import.meta.env.VITE_OIDC_AUTHORITY) ??
    'http://localhost:8080/realms/plumiotheca',
  oidcClientId: value(runtime.oidcClientId) ?? value(import.meta.env.VITE_OIDC_CLIENT_ID) ?? 'web',
  apiUrl: value(runtime.apiUrl) ?? value(import.meta.env.VITE_API_URL) ?? '/api',
};
