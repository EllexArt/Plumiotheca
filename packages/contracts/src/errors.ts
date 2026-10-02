import { z } from 'zod';

/** Une erreur de validation, rattachée au champ concerné (jamais la valeur reçue). */
export const ValidationIssue = z.strictObject({
  /** Chemin du champ, ex. « title » ou « chapters.0.title » (vide : le corps entier). */
  path: z.string(),
  message: z.string(),
  code: z.string(),
});
export type ValidationIssue = z.infer<typeof ValidationIssue>;

/**
 * Réponse d'erreur de l'API (RFC 9457, application/problem+json).
 * Ne contient jamais de pile d'appels, de requête SQL ni de donnée personnelle.
 */
export const Problem = z.strictObject({
  /** Identifiant stable du type d'erreur, ex. « validation » ou « introuvable ». */
  type: z.string(),
  /** Résumé lisible, en français, affichable tel quel. */
  title: z.string(),
  status: z.int().min(400).max(599),
  detail: z.string().optional(),
  /** À communiquer au support : retrouve la requête dans les journaux. */
  requestId: z.string().optional(),
  errors: z.array(ValidationIssue).optional(),
});
export type Problem = z.infer<typeof Problem>;
