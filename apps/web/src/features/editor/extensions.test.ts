import {
  MAX_CHARACTERS,
  MAX_CHILDREN,
  MAX_LIST_DEPTH,
  MAX_TEXT,
  parseDocument,
} from '@plumiotheca/editor-schema';
import { Editor, getSchema, type JSONContent } from '@tiptap/core';
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

describe('identifiants de blocs (#147)', () => {
  const block = (id: string, text: string) => ({
    type: 'paragraph',
    attrs: { id },
    content: [{ type: 'text', text }],
  });
  const editorWith = (...content: unknown[]) =>
    new Editor({ extensions: editorExtensions, content: docOf(...content) as JSONContent });
  const ids = (editor: Editor) =>
    (editor.getJSON().content ?? []).map((node) => [
      (node.attrs as { id?: string } | undefined)?.id,
      (node.content?.[0] as { text?: string } | undefined)?.text ?? '',
    ]);
  const plugin = (editor: Editor) =>
    editor.state.plugins.find((p) => (p as unknown as { key: string }).key.startsWith('blockIds'))!;

  it('Entrée au début d’un paragraphe : paragraphe vide au-dessus, le texte garde son identifiant', () => {
    const editor = editorWith(block('bloc-texte-1', 'Il était une fois.'));
    editor.commands.setTextSelection(1);
    editor.commands.keyboardShortcut('Enter');
    const [empty, text] = ids(editor);
    expect(text).toEqual(['bloc-texte-1', 'Il était une fois.']);
    expect(empty?.[1]).toBe('');
    expect(empty?.[0]).toMatch(/^[A-Za-z0-9_-]{8,32}$/);
    expect(empty?.[0]).not.toBe('bloc-texte-1');
    // Le curseur reste au début du texte.
    editor.commands.insertContent('A');
    expect(ids(editor)[1]?.[1]).toBe('AIl était une fois.');
    editor.destroy();
  });

  it('glisser-déposer dans le chapitre : le bloc déplacé garde son identifiant ; un collage ordinaire non', () => {
    const editor = editorWith(block('bloc-depose-1', 'Un.'), block('bloc-autre-01', 'Deux.'));
    const slice = editor.state.doc.slice(0, editor.state.doc.child(0).nodeSize);
    const transform = plugin(editor).props.transformPasted!.bind(plugin(editor));
    const view = editor.view as unknown as { dragging: { move: boolean } | null };
    view.dragging = { move: true };
    expect(transform(slice, editor.view, false).content.firstChild?.attrs.id).toBe('bloc-depose-1');
    view.dragging = null;
    expect(transform(slice, editor.view, false).content.firstChild?.attrs.id).toBeNull();
    editor.destroy();
  });

  it('couper puis coller : identifiant gardé ; un second collage du même bloc en reçoit un nouveau', () => {
    const editor = editorWith(block('bloc-coupe-01', 'Un.'), block('bloc-autre-01', 'Deux.'));
    const size = editor.state.doc.child(0).nodeSize;
    editor.commands.setTextSelection({ from: 0, to: size });
    const slice = editor.state.selection.content();
    const handlers = plugin(editor).props.handleDOMEvents!;
    handlers.cut!.call(plugin(editor), editor.view, new Event('cut') as ClipboardEvent);
    editor.commands.deleteRange({ from: 0, to: size });
    const transform = plugin(editor).props.transformPasted!.bind(plugin(editor));
    const pasted = transform(slice, editor.view, false);
    expect(pasted.content.firstChild?.attrs.id).toBe('bloc-coupe-01');
    editor.commands.insertContentAt(editor.state.doc.content.size, pasted.content.toJSON());
    // Le bloc est de retour dans le chapitre : un nouveau collage est une copie.
    expect(transform(slice, editor.view, false).content.firstChild?.attrs.id).toBeNull();
    editor.destroy();
  });

  it('doublons : laissés à l’API, qui départage d’après le texte enregistré', () => {
    const editor = editorWith(block('bloc-double-1', 'Un.'), block('bloc-double-1', 'Deux.'));
    editor.commands.insertContentAt(editor.state.doc.content.size, { type: 'paragraph' });
    const [first, second, added] = ids(editor);
    expect([first?.[0], second?.[0]]).toEqual(['bloc-double-1', 'bloc-double-1']);
    expect(added?.[0]).toMatch(/^[A-Za-z0-9_-]{8,32}$/);
    editor.destroy();
  });
});
