import { handleKey } from '@plumiotheca/contracts';

/**
 * Noms qui pourraient faire croire à un message officiel (charte 3.4). On compare un
 * « squelette » : forme normalisée, sans séparateurs, chiffres sosies remplacés
 * (« p1umi0theca » → « plumiotheca », « equipe-plumiotheca » → « equipeplumiotheca »).
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
  'null',
  'undefined',
];
/** Interdits même au milieu d'un nom (« moderation_officielle », « lequipeplumiotheca »). */
const CONTAINED = ['plumiotheca', 'moderat', 'administr', 'equipe'];

const LOOKALIKE_DIGITS: Record<string, string> = {
  '0': 'o',
  '1': 'l',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
};

export function skeleton(text: string): string {
  return handleKey(text)
    .replace(/[^a-z0-9]/g, '')
    .replace(/[013457]/g, (d) => LOOKALIKE_DIGITS[d] ?? d);
}

export function isReservedName(text: string): boolean {
  const s = skeleton(text);
  return EXACT.includes(s) || CONTAINED.some((word) => s.includes(word));
}
