import {
  LENGTHS,
  type LengthBucket,
  CharacterName,
  Completion,
  Language,
  MajorWarning,
  Rating,
  RelationshipText,
  StorySort,
  TagName,
  normalizeTag,
} from '@plumiotheca/contracts';
import type { Limits } from './limits';

// Tranches de longueur et classement maximum : définis dans les contrats (alertes, #80).
export { LENGTHS, ratingsAbove, type LengthBucket } from '@plumiotheca/contracts';

export const SORT_LABELS: Record<StorySort | 'pertinence', string> = {
  pertinence: 'Pertinence',
  recentes: 'Les plus récentes',
  mises_a_jour: 'Mises à jour récemment',
  lecteurs: 'Les plus lues',
  longueur: 'Les plus longues',
};

/** Filtres d'Explorer et de la recherche (#32), tous reflétés dans l'adresse (partageable). */
export interface SearchFilters {
  /** Tags inclus (l'histoire les porte tous) et exclus (pour cette recherche). */
  tags: string[];
  sans: string[];
  statut?: Completion | undefined;
  langues: string[];
  /** Classement maximum : Tout public, Ado ou Mature (tout). */
  classementMax?: Rating | undefined;
  longueur?: LengthBucket | undefined;
  /** Avertissements majeurs à exclure (« non précisés » compris). */
  exclure: MajorWarning[];
  tri?: StorySort | 'pertinence' | undefined;
  /** Relations et personnages (#79) : l'histoire les porte tous. */
  relations: string[];
  personnages: string[];
}

export const NO_FILTERS: SearchFilters = {
  tags: [],
  sans: [],
  langues: [],
  exclure: [],
  relations: [],
  personnages: [],
};

const list = (value: string | null) => (value ?? '').split(',').filter(Boolean);
const valid = <T>(values: string[], check: (v: string) => v is T & string) => values.filter(check);

/** Filtres lus dans l'adresse ; une valeur impossible est ignorée. */
export function readFilters(params: URLSearchParams): SearchFilters {
  const statut = Completion.safeParse(params.get('statut')).data;
  const classementMax = Rating.safeParse(params.get('classementMax')).data;
  const longueur = params.get('longueur');
  const tri = params.get('tri');
  return {
    tags: list(params.get('tags')).filter((t) => TagName.safeParse(t).success),
    sans: list(params.get('sans')).filter((t) => TagName.safeParse(t).success),
    statut,
    langues: list(params.get('langues')).filter((l) => Language.safeParse(l).success),
    classementMax,
    longueur: longueur && longueur in LENGTHS ? (longueur as LengthBucket) : undefined,
    exclure: valid(
      list(params.get('exclure')),
      (w): w is MajorWarning => MajorWarning.safeParse(w).success,
    ),
    tri:
      tri === 'pertinence' || StorySort.safeParse(tri).success
        ? (tri as SearchFilters['tri'])
        : undefined,
    relations: list(params.get('relations')).filter((r) => RelationshipText.safeParse(r).success),
    personnages: list(params.get('personnages')).filter((c) => CharacterName.safeParse(c).success),
  };
}

/** Écrit les filtres dans l'adresse, en gardant la recherche et le tag de la page. */
export function writeFilters(params: URLSearchParams, filters: SearchFilters): URLSearchParams {
  const next = new URLSearchParams();
  for (const key of ['q', 'tag']) {
    const value = params.get(key);
    if (value) next.set(key, value);
  }
  const set = (key: string, value: string | undefined) => {
    if (value) next.set(key, value);
  };
  set('tags', filters.tags.join(','));
  set('sans', filters.sans.join(','));
  set('statut', filters.statut);
  set('langues', filters.langues.join(','));
  set('classementMax', filters.classementMax);
  set('longueur', filters.longueur);
  set('exclure', filters.exclure.join(','));
  set('tri', filters.tri);
  set('relations', filters.relations.join(','));
  set('personnages', filters.personnages.join(','));
  return next;
}

export const hasFilters = (f: SearchFilters) =>
  f.tags.length > 0 ||
  f.sans.length > 0 ||
  f.langues.length > 0 ||
  f.exclure.length > 0 ||
  f.relations.length > 0 ||
  f.personnages.length > 0 ||
  !!(f.statut || f.classementMax || f.longueur || f.tri);

/** Exclusions propres aux filtres (tags et avertissements majeurs exclus) ; null s'il n'y en a pas. */
export function filterExclusions(filters: SearchFilters | undefined): Limits | null {
  if (!filters || (!filters.sans.length && !filters.exclure.length)) return null;
  return {
    hiddenContentWarnings: [],
    hiddenMajorWarnings: filters.exclure,
    hiddenTags: filters.sans.map(normalizeTag),
  };
}

/**
 * Exclusions d'une recherche : Mes limites, plus celles des filtres (tags et avertissements
 * majeurs exclus pour cette recherche). Signalées de la même façon, et consultables pour cette fois.
 */
export function exclusionsOf(limits: Limits, filters: SearchFilters | undefined): Limits {
  if (!filters) return limits;
  return {
    hiddenContentWarnings: limits.hiddenContentWarnings,
    hiddenMajorWarnings: [...new Set([...limits.hiddenMajorWarnings, ...filters.exclure])],
    hiddenTags: [...new Set([...limits.hiddenTags, ...filters.sans.map(normalizeTag)])],
  };
}
