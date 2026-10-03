import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CHARTER_ARTICLES, CHARTER_VERSION } from './charter.js';

const text = readFileSync(new URL('../../../docs/charte.md', import.meta.url), 'utf8');

describe('charte', () => {
  it('la liste des articles correspond exactement au texte', () => {
    const inText = [...text.matchAll(/^\*\*(\d+\.\d+)\*\*/gm)].map((m) => m[1]);
    expect(inText).toEqual(Object.keys(CHARTER_ARTICLES));
  });

  it('le texte porte la version en vigueur', () => {
    expect(text).toMatch(new RegExp(`^Version ${CHARTER_VERSION}\\b`, 'm'));
  });
});
