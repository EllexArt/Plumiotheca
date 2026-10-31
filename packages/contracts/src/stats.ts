import { z } from 'zod';

/**
 * Bilan de lecture (#34) : un petit bilan personnel, jamais montré aux autres, sans série de
 * jours, badge ni objectif. Activé par défaut ; le désactiver arrête la mesure du temps de
 * lecture et efface celui déjà mesuré.
 */
export const SetReadingStats = z.strictObject({ readingStats: z.boolean() });
export type SetReadingStats = z.infer<typeof SetReadingStats>;

/**
 * Plus long temps envoyé d'un coup : le lecteur l'envoie toutes les minutes, et le temps lu
 * hors ligne par tranches d'une heure au retour du réseau (#35).
 */
export const MAX_READING_SECONDS = 3600;

/** Temps de lecture à ajouter au mois en cours. */
export const ReadingTime = z.strictObject({
  seconds: z.int().min(1).max(MAX_READING_SECONDS),
});
export type ReadingTime = z.infer<typeof ReadingTime>;

export const ReadingStats = z.strictObject({
  /** Histoires de Mes lectures, par étagère. */
  finished: z.int(),
  reading: z.int(),
  toRead: z.int(),
  /** Chapitres et mots lus : les chapitres avant la position de reprise, tous pour une terminée. */
  chaptersRead: z.int(),
  wordsRead: z.int(),
  /** Temps de lecture, en minutes (mois en cours, année en cours, depuis le début). */
  minutesThisMonth: z.int(),
  minutesThisYear: z.int(),
  minutesTotal: z.int(),
  /** Douze derniers mois, du plus ancien au plus récent (« 2026-10 »), mois vides compris. */
  months: z.array(z.strictObject({ month: z.string(), minutes: z.int() })),
});
export type ReadingStats = z.infer<typeof ReadingStats>;
