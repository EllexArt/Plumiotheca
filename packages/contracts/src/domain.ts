import { z } from 'zod';

// Valeurs métier partagées par l'API (colonnes de la base) et le web (formulaires, filtres).

/** Tranche d'âge autorisée sur Plumiotheca (15 ans minimum) ; jamais de date de naissance. */
export const AgeBand = z.enum(['15-17', '18+']);
export type AgeBand = z.infer<typeof AgeBand>;

/**
 * Réponse à la question de l'âge, à la première visite (décision 34). « Moins de 15 ans »
 * est conservé pour verrouiller le compte : on ne peut pas recommencer en changeant d'âge.
 */
export const DeclaredAge = z.enum(['under-15', '15-17', '18+']);
export type DeclaredAge = z.infer<typeof DeclaredAge>;

/** Classement d'une histoire. « Explicite » est reporté (décision 22) : absent à dessein. */
export const Rating = z.enum(['general', 'teen', 'mature']);
export type Rating = z.infer<typeof Rating>;

export const StoryStatus = z.enum(['draft', 'published', 'archived']);
export type StoryStatus = z.infer<typeof StoryStatus>;

export const Completion = z.enum(['in_progress', 'completed']);
export type Completion = z.infer<typeof Completion>;

/**
 * Avertissements majeurs, obligatoires avant publication : une liste vide signifie
 * « aucun ne s'applique », `unspecified` « je préfère ne pas préciser ».
 */
export const MajorWarning = z.enum([
  'character_death',
  'graphic_violence',
  'non_consent',
  'unspecified',
]);
export type MajorWarning = z.infer<typeof MajorWarning>;

/**
 * Avertissements facultatifs (liste fine, §5 ter) : en plus des avertissements majeurs,
 * pour que les personnes qui lisent puissent éviter un sujet. Liste fermée, traduisible.
 */
export const ContentWarning = z.enum([
  'grief',
  'suicide',
  'self_harm',
  'eating_disorder',
  'addiction',
  'abuse',
  'harassment',
  'discrimination',
]);
export type ContentWarning = z.infer<typeof ContentWarning>;

export const ChapterStatus = z.enum(['draft', 'published']);
export type ChapterStatus = z.infer<typeof ChapterStatus>;

/** Instantanés d'un chapitre : sauvegarde automatique, version nommée, version publiée. */
export const RevisionKind = z.enum(['autosave', 'named', 'published']);
export type RevisionKind = z.infer<typeof RevisionKind>;

/** Tags libres et avertissements facultatifs (liste fine). */
export const TagKind = z.enum(['freeform', 'warning']);
export type TagKind = z.infer<typeof TagKind>;

/** Choix fait à la suppression du compte (décision 26). */
export const DeletionMode = z.enum(['erase', 'anonymize']);
export type DeletionMode = z.infer<typeof DeletionMode>;

export const AccountStatus = z.enum(['active', 'deletion_pending', 'deleted']);
export type AccountStatus = z.infer<typeof AccountStatus>;
