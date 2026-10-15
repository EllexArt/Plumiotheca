import {
  MAX_CHARACTERS,
  MAX_CHILDREN,
  MAX_LIST_DEPTH,
  MAX_TEXT,
  parseDocument,
} from '@plumiotheca/editor-schema';
import { getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { editorExtensions, limitViolation } from './extensions';

const schema = getSchema(editorExtensions);
const p = (text: string) => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
const docOf = (...content: unknown[]) => ({ type: 'doc', content });
const list = (depth: number): unknown =>
  depth === 0
    ? p('fin')
    : { type: 'bulletList', content: [{ type: 'listItem', content: [p('x'), list(depth - 1)] }] };

/** Même verdict que l'API : refusé par l'éditeur si et seulement si parseDocument refuse. */
function check(json: object) {
  const refused = limitViolation(schema.nodeFromJSON(json));
  const api = parseDocument(json);
  expect(refused === null).toBe(api.success);
  return refused;
}

describe('limites de l’éditeur, alignées sur l’API (#148)', () => {
  it('document ordinaire : accepté', () => {
    expect(check(docOf(p('Il était une fois.'), list(MAX_LIST_DEPTH)))).toBeNull();
  });

  it('paragraphe de plus de 20 000 caractères : refusé, avec la raison', () => {
    expect(check(docOf(p('a'.repeat(MAX_TEXT))))).toBeNull();
    expect(check(docOf(p('a'.repeat(MAX_TEXT + 1))))).toMatch(/Paragraphe trop long/);
  });

  it('listes trop imbriquées : refusées', () => {
    expect(check(docOf(list(MAX_LIST_DEPTH + 1)))).toMatch(/Listes imbriquées/);
  });

  it('citation de plus de 500 blocs : refusée', () => {
    const quote = (n: number) => ({
      type: 'blockquote',
      content: Array.from({ length: n }, () => p('x')),
    });
    expect(check(docOf(quote(MAX_CHILDREN)))).toBeNull();
    expect(check(docOf(quote(MAX_CHILDREN + 1)))).toMatch(/citation ou une liste/);
  });

  it('chapitre de plus de 300 000 caractères : refusé', () => {
    const paragraphs = Math.ceil((MAX_CHARACTERS + 1) / MAX_TEXT);
    const json = docOf(...Array.from({ length: paragraphs }, () => p('b'.repeat(MAX_TEXT))));
    expect(check(json)).toMatch(/Chapitre trop long/);
  });
});
