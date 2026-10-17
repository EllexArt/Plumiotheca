import { z } from 'zod';

/**
 * Réglages de lecture (#28), gardés sur le compte pour les retrouver d’un appareil à
 * l’autre. Les couleurs ne sont pas ici : elles suivent le thème et les ambiances (#77).
 */
/** « lisible » : Atkinson Hyperlegible (basse vision) ; « dyslexie » : OpenDyslexic (#36). */
export const ReadingFont = z.enum(['lecture', 'sans', 'lisible', 'dyslexie']);
export type ReadingFont = z.infer<typeof ReadingFont>;

export const ReadingLineHeight = z.enum(['serre', 'normal', 'aere']);
export type ReadingLineHeight = z.infer<typeof ReadingLineHeight>;

export const ReadingWidth = z.enum(['etroite', 'normale', 'large']);
export type ReadingWidth = z.infer<typeof ReadingWidth>;

/** Taille du texte, en pour cent de la taille par défaut, par pas de 10. */
export const READING_SIZE_MIN = 80;
export const READING_SIZE_MAX = 200;

export const ReadingPreferences = z.strictObject({
  font: ReadingFont,
  size: z.int().min(READING_SIZE_MIN).max(READING_SIZE_MAX).multipleOf(10),
  lineHeight: ReadingLineHeight,
  width: ReadingWidth,
});
export type ReadingPreferences = z.infer<typeof ReadingPreferences>;

/** Réglages de départ, tant que la personne n’en a pas choisi. */
export const DEFAULT_READING: ReadingPreferences = {
  font: 'lecture',
  size: 100,
  lineHeight: 'normal',
  width: 'normale',
};
