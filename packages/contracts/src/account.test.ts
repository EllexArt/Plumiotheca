import { describe, expect, it } from 'vitest';
import { Handle, handleKey } from './account.js';

describe('pseudonyme', () => {
  it.each(['Élise', 'lune_noire', 'k.l-42', 'Ōkami', 'abc'])('accepte « %s »', (h) => {
    expect(Handle.safeParse(h).success).toBe(true);
  });

  it.each(['ab', 'a'.repeat(31), 'nom@exemple.fr', 'avec espace', '...', '<script>'])(
    'refuse « %s »',
    (h) => {
      expect(Handle.safeParse(h).success).toBe(false);
    },
  );

  it('compare sans casse ni accents', () => {
    expect(handleKey('Élise')).toBe(handleKey('elise'));
    expect(handleKey('ÉLISE')).toBe('elise');
  });
});
