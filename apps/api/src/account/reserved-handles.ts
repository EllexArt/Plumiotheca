import { handleKey } from '@plumiotheca/contracts';

/**
 * Noms qui pourraient faire croire à un message officiel (charte 3.4). On compare des
 * « squelettes » : forme normalisée, sosies ramenés à la lettre imitée, sans séparateurs
 * (« p1umi0theca », « admın », « Моdération » cyrillique → « plumiotheca », « admin »…).
 */
const EXACT = [
  'admin',
  'modo',
  'staff',
  'support',
  'aide',
  'contact',
  'officiel',
  'officielle',
  'systeme',
  'root',
  'anonyme',
  'comptesupprime',
  'equipe',
  'null',
  'undefined',
];
/** Interdits même au milieu d'un nom (« moderation_officielle », « lequipeplumiotheca »). */
const CONTAINED = ['plumiotheca', 'moderateur', 'moderatrice', 'moderation', 'administr'];

/** Lettres qui imitent une lettre latine sans s'y décomposer (latin, cyrillique, grec). */
const LOOKALIKES: Record<string, string> = {
  ı: 'i',
  ł: 'l',
  ø: 'o',
  æ: 'a',
  œ: 'o',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ß: 'ss',
  ŀ: 'l',
  ǀ: 'l',
  ǁ: 'll',
  ǂ: 't',
  ǃ: 'i',
  а: 'a',
  в: 'b',
  е: 'e',
  ё: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  і: 'i',
  ј: 'j',
  ѕ: 's',
  ԁ: 'd',
  ӏ: 'l',
  α: 'a',
  β: 'b',
  ε: 'e',
  η: 'n',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ο: 'o',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
  ω: 'w',
};

function base(text: string): string {
  // Avant la mise en minuscules : « I » majuscule imite souvent « l ».
  const lowered = handleKey(text.replace(/I/g, 'l'));
  return [...lowered]
    .map((c) => LOOKALIKES[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]/g, '');
}

/** Squelettes possibles : un chiffre peut imiter plusieurs lettres (« 1 » = « l » ou « i »). */
export function skeletons(text: string): string[] {
  const b = base(text);
  const digits = (one: string) =>
    b.replace(
      /[0-9]/g,
      (d) => ({ '0': 'o', '1': one, '3': 'e', '4': 'a', '5': 's', '7': 't' })[d] ?? d,
    );
  return [...new Set([digits('l'), digits('i'), base(text.toLowerCase())])];
}

export function isReservedName(text: string): boolean {
  return skeletons(text).some(
    (s) => EXACT.includes(s) || CONTAINED.some((word) => s.includes(word)),
  );
}
