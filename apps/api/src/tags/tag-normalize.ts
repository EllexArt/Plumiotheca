/**
 * Forme normalisée d'un tag (casse, accents, tirets, espaces) : « Slow-Burn », « slow burn »
 * et « slowburn » ne donnent pas encore le même tag (synonymes : jardiniers, #78), mais
 * « Slow Burn » et « slow  burn » oui.
 */
export function normalizeTag(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      // Liaisons invisibles (ZWNJ, ZWJ) : « roma‌nce » est le même tag que « romance ».
      .replace(/[\u200C\u200D]/gu, '')
      .replace(/[\s_-]+/g, ' ')
      .trim()
  );
}
