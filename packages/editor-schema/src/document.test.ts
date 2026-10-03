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

const data = (result: ReturnType<typeof parseDocument>): ChapterDocument => {
  if (!result.success) throw new Error(JSON.stringify(result.issues));
  return result.data;
};

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
    ['un forçage du sens d’écriture', doc(p('texte \u202Eesrevni'))],
    ['une demi-paire Unicode isolée', doc(p('a\uD800b'))],
    [
      'un élément de liste qui commence par une liste',
      doc({
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{ type: 'bulletList', content: [{ type: 'listItem', content: [p('x')] }] }],
          },
        ],
      }),
    ],
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
    expect(JSON.stringify(result)).not.toContain('xxxx');
  });
});

describe('identifiants de blocs', () => {
  it('complète les identifiants manquants et remplace les doublons, sans toucher aux autres', () => {
    const input = data(
      parseDocument(
        doc(p('a', 'stable-0001'), p('b'), p('c', 'stable-0001'), {
          type: 'blockquote',
          content: [p('d')],
        }),
      ),
    );
    let n = 0;
    const out = ensureBlockIds(input, { makeId: () => `nouveau-${String(++n).padStart(4, '0')}` });
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
  const chapter = data(
    parseDocument(
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
    ),
  );

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

describe('documents hostiles', () => {
  it('une imbrication de 1 000 niveaux est refusée, sans exception', () => {
    let node: unknown = p('fond');
    for (let i = 0; i < 1_000; i++) node = { type: 'blockquote', content: [node] };
    const result = parseDocument(doc(node));
    expect(result.success).toBe(false);
  });

  it('les erreurs sont plafonnées', () => {
    const bad = doc(
      ...Array.from({ length: 5_000 }, () => ({ type: 'paragraph', attrs: { inconnu: 1 } })),
    );
    const result = parseDocument(bad);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.length).toBeLessThanOrEqual(20);
  });

  it('des clés « __proto__ » ne polluent rien', () => {
    const input: unknown = JSON.parse(
      '{"type":"doc","content":[{"type":"paragraph","__proto__":{"x":1}}]}',
    );
    expect(parseDocument(input).success).toBe(false);
    expect(({} as { x?: number }).x).toBeUndefined();
  });
});

describe('doublons d’identifiants et version précédente', () => {
  it('une copie collée au-dessus de l’original ne lui vole pas son identifiant', () => {
    const previous = data(parseDocument(doc(p('original annoté', 'original1'))));
    const next = data(
      parseDocument(doc(p('copie collée', 'original1'), p('original annoté', 'original1'))),
    );
    const out = ensureBlockIds(next, { previous });
    expect(out.content[1]?.attrs?.id).toBe('original1');
    expect(out.content[0]?.attrs?.id).not.toBe('original1');
  });
});

describe('langues', () => {
  it('compte les mots du chinois, du japonais et du thaï', () => {
    expect(wordCount(data(parseDocument(doc(p('我喜欢读书。')))), 'zh')).toBeGreaterThan(1);
    expect(wordCount(data(parseDocument(doc(p('ฉันชอบอ่านหนังสือ')))), 'th')).toBeGreaterThan(1);
  });
});
