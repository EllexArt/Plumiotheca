import { z } from 'zod';

/** Rôles de la plateforme portés par le jeton (rôles de realm Keycloak). */
export const Role = z.enum(['moderation', 'administration', 'jardinage-tags']);
export type Role = z.infer<typeof Role>;

/** Rôles qui exigent une double authentification faite pendant cette connexion. */
export const ROLES_WITH_MFA: readonly Role[] = ['moderation', 'administration'];

/**
 * Session de la personne connectée, telle que l'API la comprend.
 * Ni e-mail ni identifiant Keycloak : le profil public arrive avec #12.
 */
export const MySession = z.strictObject({
  /** Rôles actifs pour cette session. */
  roles: z.array(Role),
  /** Rôles détenus mais inactifs tant que la double authentification n'est pas faite. */
  rolesAwaitingMfa: z.array(Role),
  /** Vrai si un second facteur (code TOTP) a été validé pendant cette connexion. */
  mfa: z.boolean(),
});
export type MySession = z.infer<typeof MySession>;
