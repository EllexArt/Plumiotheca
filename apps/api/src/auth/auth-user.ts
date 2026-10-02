import type { Role } from '@plumiotheca/contracts';

/** Personne authentifiée, déduite d'un jeton vérifié. */
export interface AuthUser {
  /** Identifiant Keycloak (claim « sub ») : privé, jamais renvoyé dans une réponse publique. */
  id: string;
  roles: Role[];
  /** Second facteur validé pendant cette connexion (claim « amr »). */
  mfa: boolean;
}
