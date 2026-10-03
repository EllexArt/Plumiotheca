import { describe, expect, it } from 'vitest';
import { isReservedName } from './reserved-handles.js';

describe('noms réservés', () => {
  it.each([
    'admin',
    'admın',
    'Ædmin',
    'adm1n',
    'PIumiotheca',
    'płumiotheca',
    'p1umi0theca',
    'Møderation',
    'mođeration',
    'Моdération',
    'Plυmiotheca',
    'equipe-plumiotheca',
    'moderation_officielle',
    'Équipe',
  ])('reconnaît « %s »', (name) => {
    expect(isReservedName(name)).toBe(true);
  });

  it.each(['Fan de l’équipe de France', 'Équipement', 'moderato_cantabile', 'Élise', 'Badminton'])(
    'laisse passer « %s »',
    (name) => {
      expect(isReservedName(name)).toBe(false);
    },
  );
});
