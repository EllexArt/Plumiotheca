import { handleKey } from '@plumiotheca/contracts';

/**
 * Pseudonymes réservés : ils pourraient faire croire à un message officiel (charte 3.4).
 * Comparés sous forme normalisée ; tout ce qui commence par « plumiotheca » l'est aussi.
 */
const RESERVED = new Set(
  [
    'admin',
    'administrateur',
    'administratrice',
    'administration',
    'moderation',
    'moderateur',
    'moderatrice',
    'modo',
    'equipe',
    'staff',
    'support',
    'aide',
    'contact',
    'officiel',
    'officielle',
    'systeme',
    'root',
    'anonyme',
    'compte-supprime',
    'null',
    'undefined',
  ].map(handleKey),
);

export function isReservedHandle(key: string): boolean {
  return RESERVED.has(key) || key.startsWith('plumiotheca');
}
