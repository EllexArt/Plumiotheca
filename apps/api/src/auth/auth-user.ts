import type { Role } from '@plumiotheca/contracts';

/** Personne authentifiée, déduite d'un jeton vérifié. */
export interface AuthUser {
  /** Identifiant Keycloak (claim « sub ») : privé, jamais renvoyé dans une réponse publique. */
  id: string;
  /**
   * Rôles effectifs. Sans second facteur, la modération et l'administration n'y figurent
   * pas : aucun traitement ne peut s'appuyer dessus par erreur.
   */
  roles: Role[];
  /** Rôles détenus mais inactifs faute de second facteur pendant cette connexion. */
  rolesAwaitingMfa: Role[];
  /** Second facteur validé pendant cette connexion (claim « amr »). */
  mfa: boolean;
}
