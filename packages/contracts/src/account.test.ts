import { describe, expect, it } from 'vitest';
import { Handle, handleKey } from './account.js';

describe('pseudonyme', () => {
  it.each(['Élise', 'lune_noire', 'k.l-42', 'Ōkami', 'abc', 'Søren', 'Çağla'])(
    'accepte « %s »',
    (h) => {
      expect(Handle.safeParse(h).success).toBe(true);
    },
  );

  it('accepte un « é » saisi en deux morceaux (e + accent)', () => {
    const parsed = Handle.parse('E\u0301lise');
    expect(parsed).toBe('Élise');
  });

  it.each([
    'ab',
    'a'.repeat(31),
    'nom@exemple.fr',
    'avec espace',
    '...',
    '<script>',
    '\u0430dmin', // « а » cyrillique
    'pl\u0443miotheca', // « у » cyrillique
    '\u3164\u3164\u3164', // remplissage coréen invisible
    '\u{1D404}\u{1D425}\u{1D422}\u{1D42C}\u{1D41E}', // lettres mathématiques
    '\uFDFA'.repeat(5), // une fois normalisé, 90 caractères
    'ǆ'.repeat(16), // « dz » une fois normalisé : 32 caractères
    'Ōkami\u05D0', // mélange avec l'hébreu
  ])('refuse « %s »', (h) => {
    expect(Handle.safeParse(h).success).toBe(false);
  });

  it('compare sans casse ni accents', () => {
    expect(handleKey('Élise')).toBe(handleKey('elise'));
    expect(handleKey('ÉLISE')).toBe('elise');
  });
});
