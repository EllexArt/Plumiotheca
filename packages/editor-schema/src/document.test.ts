import { describe, expect, it } from 'vitest';
import {
  ensureBlockIds,
  MAX_CHARACTERS,
  parseDocument,
  plainText,
  readingMinutes,
  wordCount,
} from './document.js';
import type { ChapterDocument } from './schema.js';

const p = (text: string, id?: string) => ({
  type: 'paragraph' as const,
  ...(id ? { attrs: { id } } : {}),
  content: [{ type: 'text' as const, text }],
});

const doc = (...content: unknown[]) => ({ type: 'doc', content });

describe('validation', () => {
  it('accepte un chapitre tel que l’éditeur le produit', () => {
    const input = doc(
      {
        type: 'heading',
        attrs: { id: 'titre-0001', level: 2, textAlign: null },
        content: [{ type: 'text', text: 'I' }],
      },
      {
        type: 'paragraph',
        attrs: { id: 'para-00001', textAlign: 'center' },
        content: [
          { type: 'text', text: 'Il était ', marks: [{ type: 'italic' }] },
          { type: 'hardBreak' },
          { type: 'text', text: 'une fois', marks: [{ type: 'bold' }, { type: 'italic' }] },
        ],
      },
      { type: 'horizontalRule', attrs: { id: 'scene-0001' } },
      { type: 'blockquote', content: [p('Citation')] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [p('un')] }] },
      { type: 'paragraph' },
    );
    expect(parseDocument(input).success).toBe(true);
  });

  it.each([
    ['un nœud inconnu (image)', doc({ type: 'image', attrs: { src: 'https://exemple.fr/x.png' } })],
    ['du HTML brut', doc({ type: 'html', content: '<script>alert(1)</script>' })],
    [
      'un lien',
      doc({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'ici',
            marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
          },
        ],
      }),
    ],
    ['un attribut inconnu', doc({ type: 'paragraph', attrs: { id: 'para-00001', onclick: 'x' } })],
    ['un titre de niveau 1', doc({ type: 'heading', attrs: { level: 1 }, content: [] })],
    ['un texte vide', doc({ type: 'paragraph', content: [{ type: 'text', text: '' }] })],
    ['un caractère de contrôle', doc(p('a\u0000b'))],
    [
      'une marque en double',
      doc({
        type: 'paragraph',
        content: [{ type: 'text', text: 'x', marks: [{ type: 'bold' }, { type: 'bold' }] }],
      }),
    ],
    ['un identifiant de bloc invalide', doc(p('x', '<b>'))],
    ['une racine qui n’est pas un document', { type: 'paragraph', content: [] }],
  ])('refuse %s', (_, input) => {
    expect(parseDocument(input).success).toBe(false);
  });

  it('refuse des listes imbriquées trop profondément', () => {
    let list: unknown = {
      type: 'bulletList',
      content: [{ type: 'listItem', content: [p('fin')] }],
    };
    for (let i = 0; i < 5; i++) {
      list = { type: 'bulletList', content: [{ type: 'listItem', content: [p('niveau'), list] }] };
    }
    expect(parseDocument(doc(list)).success).toBe(false);
  });

  it('refuse un chapitre trop long, avec un message qui ne cite pas le texte', () => {
    const big = doc(...Array.from({ length: 20 }, () => p('x'.repeat(MAX_CHARACTERS / 19))));
    const result = parseDocument(big);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error)).not.toContain('xxxx');
  });
});

describe('identifiants de blocs', () => {
  it('complète les identifiants manquants et remplace les doublons, sans toucher aux autres', () => {
    const input = parseDocument(
      doc(p('a', 'stable-0001'), p('b'), p('c', 'stable-0001'), {
        type: 'blockquote',
        content: [p('d')],
      }),
    ).data as ChapterDocument;
    let n = 0;
    const out = ensureBlockIds(input, () => `nouveau-${String(++n).padStart(4, '0')}`);
    const ids = out.content.map((b) => b.attrs?.id);
    expect(ids[0]).toBe('stable-0001');
    expect(new Set(ids).size).toBe(4);
    expect(ids.every((id) => typeof id === 'string')).toBe(true);
    // Le document d'origine n'est pas modifié.
    expect(input.content[1]?.attrs).toBeUndefined();
    // Idempotent : une seconde passe ne change rien.
    expect(ensureBlockIds(out)).toEqual(out);
  });
});

describe('mots et texte', () => {
  const chapter = parseDocument(
    doc(
      p('Il était peut-être l’aube.'),
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'bon', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'jour ' },
          { type: 'text', text: '« Viens ! »' },
        ],
      },
      { type: 'horizontalRule' },
    ),
  ).data as ChapterDocument;

  it('compte les mots comme un traitement de texte', () => {
    expect(wordCount(chapter)).toBe(6);
  });

  it('donne le texte brut, un bloc par ligne', () => {
    expect(plainText(chapter)).toBe('Il était peut-être l’aube.\nbonjour « Viens ! »\n***');
  });

  it('estime le temps de lecture', () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(2300)).toBe(10);
  });
});
