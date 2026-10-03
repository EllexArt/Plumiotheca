import { WebStorageStateStore, type User } from 'oidc-client-ts';
import type { AuthProviderProps } from 'react-oidc-context';

/** Ce que l'application retient pendant l'aller-retour vers Keycloak. */
export interface SigninState {
  /** Page à rouvrir après la connexion (chemin interne uniquement). */
  returnTo: string;
}

/**
 * Chemin de retour sûr : une page de Plumiotheca, jamais une autre adresse
 * (« //exemple.org » ou « https:… » feraient sortir la personne du site).
 */
export function safeReturnTo(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/';
}

export const returnToOf = (user: User | null | undefined): string =>
  safeReturnTo((user?.state as Partial<SigninState> | undefined)?.returnTo);

const origin = window.location.origin;

/**
 * Authorization Code + PKCE (client public « web » du realm, décision 6). Le jeton est
 * gardé dans la session de l'onglet (fermée avec lui), jamais dans localStorage ; il est
 * renouvelé en arrière-plan avant expiration, sans déconnexion surprise.
 */
export const oidcSettings: AuthProviderProps = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY ?? 'http://localhost:8080/realms/plumiotheca',
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID ?? 'web',
  redirect_uri: `${origin}/connexion`,
  post_logout_redirect_uri: `${origin}/`,
  scope: 'openid',
  ui_locales: 'fr',
  automaticSilentRenew: true,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
};
