import { describe, expect, it } from 'vitest';
import { Problem } from './index.js';

describe('Problem', () => {
  it('accepte une erreur de validation', () => {
    const ok = Problem.safeParse({
      type: 'validation',
      title: 'Requête invalide',
      status: 400,
      errors: [{ path: 'title', message: 'Obligatoire', code: 'invalid_type' }],
    });
    expect(ok.success).toBe(true);
  });

  it('refuse un champ inconnu (ex. une pile d’appels)', () => {
    const ko = Problem.safeParse({
      type: 'interne',
      title: 'Erreur interne',
      status: 500,
      stack: 'Error: …',
    });
    expect(ko.success).toBe(false);
  });
});
