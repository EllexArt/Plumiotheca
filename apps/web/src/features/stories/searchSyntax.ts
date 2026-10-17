/**
 * Saisie intelligente (#31) : `-tag` ou `-"tag en plusieurs mots"` exclut un tag ; le reste
 * est cherché tel quel. Les tags à inclure se choisissent dans les suggestions.
 */
const EXCLUSION = /(^|\s)-(?:"([^"]+)"?|([^\s"]+))(?=\s|$)/g;

/** Texte cherché et tags exclus d'une saisie. */
export function parseSearch(input: string): { text: string; sans: string[] } {
  const sans: string[] = [];
  const text = input
    .replace(EXCLUSION, (_, space: string, quoted?: string, bare?: string) => {
      const tag = (quoted ?? bare ?? '').trim();
      if (tag) sans.push(tag);
      return space;
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { text, sans };
}

/**
 * Ce qui est en train d'être tapé, pour les suggestions : une exclusion commencée en fin de
 * saisie (« dragons -ang »), ou sinon tout le texte cherché. `rest` : la saisie sans ce
 * fragment, à garder quand une suggestion de tag est choisie.
 */
export function typing(input: string): {
  exclude: boolean;
  fragment: string;
  rest: string;
} {
  const open = /(^|\s)-(?:"([^"]*)|([^\s"]*))$/.exec(input);
  if (open) {
    return {
      exclude: true,
      fragment: (open[2] ?? open[3] ?? '').trim(),
      rest: input.slice(0, open.index + open[1]!.length).trim(),
    };
  }
  const { text, sans } = parseSearch(input);
  return { exclude: false, fragment: text, rest: sans.map(asExclusion).join(' ') };
}

/** Exclusion écrite dans la saisie (guillemets s'il y a une espace). */
export const asExclusion = (tag: string) => (/\s/.test(tag) ? `-"${tag}"` : `-${tag}`);
