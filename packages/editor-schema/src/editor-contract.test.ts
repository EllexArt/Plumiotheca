// Test de contrat : ce que l'éditeur (TipTap configuré comme dans l'application) produit
// doit passer parseDocument, et ce que parseDocument accepte doit se recharger dans
// l'éditeur. TipTap n'est qu'une dépendance de test : le paquet publié n'en dépend pas.
import { getSchema } from '@tiptap/core';
import TextAlign from '@tiptap/extension-text-align';
import { generateJSON } from '@tiptap/html';
import { Node } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { describe, expect, it } from 'vitest';
import { ensureBlockIds, parseDocument } from './document.js';

/** Configuration de l'éditeur : à reprendre telle quelle dans l'application web. */
export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    link: false,
  }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
];
const schema = getSchema(editorExtensions);

const corpus = {
  'paragraphes et marques':
    '<p>Il <em>était</em> <strong>une</strong> <u>fois</u> <s>deux</s>.</p>',
  'retour à la ligne en gras': '<p>a<strong>b<br>c</strong></p>',
  'liste numérotée (début à 3)': '<ol start="3"><li><p>trois</p></li><li><p>quatre</p></li></ol>',
  'liste à puces imbriquée': '<ul><li><p>un</p><ul><li><p>sous</p></li></ul></li></ul>',
  'citation contenant une liste': '<blockquote><ul><li><p>x</p></li></ul></blockquote>',
  'citation dans une citation': '<blockquote><blockquote><p>x</p></blockquote></blockquote>',
  'liste dans une citation dans une liste':
    '<ul><li><p>a</p><blockquote><p>b</p></blockquote></li></ul>',
  'séparateur de scène': '<p>fin</p><hr><p>suite</p>',
  intertitres: '<h2>Partie</h2><h3>Section</h3><p style="text-align: center">centré</p>',
  'collage depuis Word':
    '<p class="MsoNormal" style="margin:0;text-align:justify"><span style="font-family:Garamond">Texte <b>gras</b> et <i>italique</i></span></p>',
  'paragraphe vide': '<p></p>',
  'lien et code supprimés à la saisie':
    '<p><a href="https://exemple.fr">lien</a> <code>code</code></p>',
  'titre de niveau 1 ramené': '<h1>Titre</h1>',
};

describe('contrat avec l’éditeur TipTap', () => {
  it.each(Object.entries(corpus))('« %s » produit par l’éditeur est accepté', (_, html) => {
    const json: unknown = generateJSON(html, editorExtensions);
    const result = parseDocument(json);
    expect(result.success, JSON.stringify(result)).toBe(true);
  });

  it.each(Object.entries(corpus))('« %s » accepté se recharge dans l’éditeur', (_, html) => {
    const result = parseDocument(generateJSON(html, editorExtensions));
    if (!result.success) throw new Error('refusé');
    // Les identifiants de blocs ne font pas partie du schéma de TipTap standard : on les
    // retire pour ce contrôle (l'extension d'identifiants les ajoutera côté application).
    const withoutIds = JSON.parse(
      JSON.stringify(ensureBlockIds(result.data)).replace(/,?"id":"[A-Za-z0-9_-]+"/g, ''),
    ) as Record<string, unknown>;
    expect(() => Node.fromJSON(schema, withoutIds).check()).not.toThrow();
  });
});
