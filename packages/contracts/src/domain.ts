import { z } from 'zod';

// Valeurs métier partagées par l'API (colonnes de la base) et le web (formulaires, filtres).

/** Tranche d'âge déclarée à la première visite (décision 34) ; jamais de date de naissance. */
export const AgeBand = z.enum(['15-17', '18+']);
export type AgeBand = z.infer<typeof AgeBand>;

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
