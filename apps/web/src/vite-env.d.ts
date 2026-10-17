/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Préfixe de l'API (défaut : /api, même domaine). */
  readonly VITE_API_URL?: string;
  /** Realm Keycloak (défaut : celui de l'infrastructure de développement). */
  readonly VITE_OIDC_AUTHORITY?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
