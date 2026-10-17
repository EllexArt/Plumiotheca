/**
 * Ambiances du site (#77). Chacune a son fichier de jetons, styles/palettes/<id>.css (clair
 * et sombre), chargé tout seul ; il ne reste qu'à la nommer ici. Un test vérifie que cette
 * liste et les fichiers concordent, et contrast.test.ts leurs contrastes.
 */
export const PALETTES = [
  { id: 'lueur', name: 'Lueur', description: 'Encre et ambre, par défaut' },
  { id: 'bougie', name: 'Bougie', description: 'Prune, cuivre et vin' },
  { id: 'indigo', name: 'Indigo et lune', description: 'Bleu nuit et clair de lune' },
  { id: 'rouille', name: 'Encre et rouille', description: 'Noir chaud et rouille' },
] as const;

export type PaletteId = (typeof PALETTES)[number]['id'];

/** Identité de Plumiotheca (logo, e-mails, pages publiques). */
export const DEFAULT_PALETTE: PaletteId = 'lueur';

export const isPalette = (value: string): value is PaletteId =>
  PALETTES.some((p) => p.id === value);
