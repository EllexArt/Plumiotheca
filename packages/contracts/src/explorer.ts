import { Rating } from './domain.js';

/** Tranches de longueur des filtres d’Explorer (#32), en mots, bornes comprises. */
export const LENGTHS = {
  courte: { label: 'Moins de 5 000 mots', min: 0, max: 4_999 },
  moyenne: { label: 'De 5 000 à 20 000 mots', min: 5_000, max: 19_999 },
  longue: { label: 'De 20 000 à 80 000 mots', min: 20_000, max: 79_999 },
  tres_longue: { label: 'Plus de 80 000 mots', min: 80_000, max: undefined },
} as const;
export type LengthBucket = keyof typeof LENGTHS;

/** Classements au-dessus du maximum choisi : exclus. */
export function ratingsAbove(max: Rating | undefined): Rating[] {
  if (!max) return [];
  return Rating.options.slice(Rating.options.indexOf(max) + 1);
}

/**
 * Paramètres de l’adresse d’Explorer traduits en paramètres de l’API (même traduction côté
 * site et pour les alertes des recherches enregistrées, #80) : classement maximum et tranche
 * de longueur deviennent des bornes ; les tags exclus (`sans`) sont rendus à part, pour être
 * ajoutés aux tags masqués.
 */
export function explorerToApi(params: Record<string, string>): {
  api: Record<string, string>;
  sans: string[];
} {
  const { sans, classementMax, longueur, ...api } = params;
  const above = ratingsAbove(Rating.safeParse(classementMax).data);
  if (above.length) api.exclureClassement = above.join(',');
  if (longueur && longueur in LENGTHS) {
    const { min, max } = LENGTHS[longueur as LengthBucket];
    api.motsMin = String(min);
    if (max !== undefined) api.motsMax = String(max);
  }
  return { api, sans: (sans ?? '').split(',').filter(Boolean) };
}
