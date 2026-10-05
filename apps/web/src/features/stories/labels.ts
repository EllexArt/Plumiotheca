import type { Completion, ContentWarning, MajorWarning, Rating } from '@plumiotheca/contracts';

export const ratingLabel: Record<Rating, string> = {
  general: 'Tout public',
  teen: 'Ado',
  mature: 'Mature',
};

export const ratingHint: Record<Rating, string> = {
  general: 'Lisible par toutes et tous.',
  teen: 'Thèmes plus durs, sans scène détaillée.',
  mature: 'Sujets ou scènes réservés à un public averti (15 ans et plus).',
};

export const warningLabel: Record<MajorWarning, string> = {
  character_death: 'mort d’un personnage',
  graphic_violence: 'violence explicite',
  non_consent: 'non-consentement',
  unspecified: 'avertissements non précisés',
};

export const completionLabel: Record<Completion, string> = {
  in_progress: 'en cours',
  completed: 'terminée',
};

const number = new Intl.NumberFormat('fr-FR');
export const formatNumber = (n: number) => number.format(n);

const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
export const formatDate = (iso: string) => date.format(new Date(iso));

/** « 3 chapitres », « 1 chapitre ». */
export const plural = (n: number, one: string, many = `${one}s`) =>
  `${formatNumber(n)} ${n > 1 ? many : one}`;

/** Avertissements lisibles : « aucun avertissement majeur » si la liste est vide. */
export function warningsText(warnings: MajorWarning[] | null): string | null {
  if (warnings === null) return null;
  if (!warnings.length) return 'aucun avertissement majeur';
  return warnings.map((w) => warningLabel[w]).join(', ');
}

/** Teinte de couverture tirée de l'identifiant (dos de livre des maquettes). */
const covers = [
  ['#7FB3A6', '#14202B'],
  ['#1B2733', '#E0A458'],
  ['#A24E22', '#F8F5EF'],
  ['#E0A458', '#1B2733'],
  ['#8E3B46', '#FAF4F1'],
  ['#3F7A6C', '#F7F3EC'],
  ['#3B47A8', '#F6F6FA'],
  ['#F2D48A', '#151A2D'],
] as const;

export function coverColors(id: string): { background: string; color: string } {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const [background, color] = covers[hash % covers.length]!;
  return { background, color };
}

export const contentWarningLabel: Record<ContentWarning, string> = {
  grief: 'deuil',
  violence: 'violence, sang',
  suicide: 'suicide',
  self_harm: 'automutilation',
  eating_disorder: 'troubles alimentaires',
  addiction: 'addictions',
  abuse: 'maltraitance',
  harassment: 'harcèlement',
  discrimination: 'discriminations',
  animal_harm: 'mort ou maltraitance d’animaux',
  pregnancy_loss: 'perte de grossesse',
  medical: 'scènes médicales',
};

/** Avertissements facultatifs lisibles ; null si aucun. */
export const contentWarningsText = (warnings: ContentWarning[]): string | null =>
  warnings.length ? warnings.map((w) => contentWarningLabel[w]).join(', ') : null;
