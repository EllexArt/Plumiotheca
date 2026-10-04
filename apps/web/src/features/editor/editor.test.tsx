import { parseDocument, type ChapterDocument } from '@plumiotheca/editor-schema';
import { Editor } from '@tiptap/core';
import { generateJSON } from '@tiptap/html';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { account, expectAccessible, mockApi, renderApp, signedIn } from '../../test/render';
import { BLOCK_TYPES, editorExtensions } from './extensions';

const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

function makeEditor(content: unknown) {
  const editor = new Editor({ extensions: editorExtensions, content: content as object });
  editors.push(editor);
  return editor;
}

/** Identifiants de tous les blocs du document. */
function ids(doc: { content?: unknown[] }): (string | null)[] {
  const out: (string | null)[] = [];
  const walk = (nodes: unknown[] = []) => {
    for (const node of nodes as {
      type: string;
      attrs?: { id?: string | null };
      content?: unknown[];
    }[]) {
      if (BLOCK_TYPES.includes(node.type)) out.push(node.attrs?.id ?? null);
      walk(node.content);
    }
  };
  walk(doc.content);
  return out;
}

// Même corpus que le test de contrat de packages/editor-schema.
const corpus = {
  'paragraphes et marques':
    '<p>Il <em>était</em> <strong>une</strong> <u>fois</u> <s>deux</s>.</p>',
  'retour à la ligne en gras': '<p>a<strong>b<br>c</strong></p>',
  'liste numérotée': '<ol start="3"><li><p>trois</p></li><li><p>quatre</p></li></ol>',
  'listes imbriquées dans une citation':
    '<blockquote><ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul></blockquote>',
  'séparateur de scène': '<p>fin</p><hr><p>suite</p>',
  intertitres: '<h2>Partie</h2><h3>Section</h3><p style="text-align: center">centré</p>',
  'collage depuis Word':
    '<p class="MsoNormal" style="text-align:justify"><span style="font-family:Garamond">Texte <b>gras</b></span></p>',
  'lien, code et titre de niveau 1 ramenés':
    '<h1>T</h1><p><a href="https://x.fr">lien</a> <code>c</code></p>',
};

describe('éditeur : contrat avec l’API', () => {
  it.each(Object.entries(corpus))('« %s » : accepté, un identifiant unique par bloc', (_, html) => {
    const editor = makeEditor(generateJSON(html, editorExtensions));
    // Une modification déclenche l'attribution des identifiants.
    editor.commands.insertContentAt(editor.state.doc.content.size, '<p>fin</p>');
    const doc = editor.getJSON();
    const result = parseDocument(doc);
    expect(result.success, JSON.stringify(result)).toBe(true);
    const all = ids(doc);
    expect(all.every((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{8,32}$/.test(id))).toBe(
      true,
    );
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('éditeur : identifiants de blocs', () => {
  const start: ChapterDocument = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { id: 'premier-bloc' },
        content: [{ type: 'text', text: 'Bonjour' }],
      },
    ],
  };

  it('Entrée en fin de paragraphe : le paragraphe garde son identifiant, le nouveau en reçoit un', () => {
    const editor = makeEditor(start);
    editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    editor.commands.splitBlock();
    const [first, second] = ids(editor.getJSON());
    expect(first).toBe('premier-bloc');
    expect(second).toMatch(/^[A-Za-z0-9_-]{8,32}$/);
    expect(second).not.toBe(first);
  });

  it('copie d’un bloc existant : l’original garde son identifiant, la copie en reçoit un autre', () => {
    const editor = makeEditor(start);
    editor.commands.insertContentAt(editor.state.doc.content.size, {
      type: 'paragraph',
      attrs: { id: 'premier-bloc' },
      content: [{ type: 'text', text: 'Bonjour' }],
    });
    const [first, copy] = ids(editor.getJSON());
    expect(first).toBe('premier-bloc');
    expect(copy).not.toBe('premier-bloc');
  });
});

describe('page de l’éditeur', () => {
  const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
  const CH = '01a102e1-bc70-7583-8a7d-c381bcb3647a';
  const draft = {
    id: CH,
    title: 'Le premier toit',
    status: 'draft',
    draft: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'bloc-serveur' },
          content: [{ type: 'text', text: 'Version enregistrée.' }],
        },
      ],
    },
    draftVersion: 3,
    wordCount: 2,
  };

  function api() {
    return mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url.endsWith('/brouillon') && init.method === 'PUT') {
        return { body: { draftVersion: 4, wordCount: 3, draft: null } };
      }
      if (url.endsWith('/brouillon')) return { body: draft };
      if (url === `/api/histoires/${STORY}`) {
        return {
          body: {
            id: STORY,
            title: 'Les jardins suspendus',
            summary: '',
            author: { handle: 'ilse', displayName: null },
            language: 'fr',
            rating: 'general',
            status: 'draft',
            completion: 'in_progress',
            majorWarnings: [],
            tags: [],
            wordCount: 0,
            chapterCount: 0,
            publishedAt: null,
            updatedAt: '2026-10-04T10:00:00.000Z',
            chapters: [],
          },
        };
      }
    });
  }

  it('barre d’outils et zone d’écriture accessibles', async () => {
    signedIn();
    api();
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    const toolbar = await screen.findByRole('toolbar', { name: 'Mise en forme' });
    expect(screen.getByRole('button', { name: 'Gras' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Control+B',
    );
    // Un seul arrêt de tabulation dans la barre.
    expect(toolbar.querySelectorAll('button[tabindex="0"]')).toHaveLength(1);
    expect(screen.getByRole('textbox', { name: 'Texte du chapitre' })).toHaveTextContent(
      'Version enregistrée.',
    );
    await expectAccessible();
  });

  it('copie locale non enregistrée : proposée, reprise puis enregistrée avec la bonne version', async () => {
    signedIn();
    const calls = api();
    const local = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'bloc-serveur' },
          content: [{ type: 'text', text: 'Version perdue retrouvée.' }],
        },
      ],
    };
    sessionStorage.setItem(
      `plumiotheca.brouillon.${CH}`,
      JSON.stringify({ version: 3, doc: local, at: '2026-10-04T09:00:00.000Z' }),
    );
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Reprendre cette version' }));
    expect(screen.getByRole('textbox', { name: 'Texte du chapitre' })).toHaveTextContent(
      'Version perdue retrouvée.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.getByText(/^Enregistré à/)).toBeInTheDocument());
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.body).toMatchObject({
      version: 3,
      draft: { content: [{ content: [{ text: 'Version perdue retrouvée.' }] }] },
    });
    expect(sessionStorage.getItem(`plumiotheca.brouillon.${CH}`)).toBeNull();
  });

  it('copie locale identique au brouillon : rien n’est proposé', async () => {
    signedIn();
    api();
    sessionStorage.setItem(
      `plumiotheca.brouillon.${CH}`,
      JSON.stringify({ version: 3, doc: draft.draft, at: '2026-10-04T09:00:00.000Z' }),
    );
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    await screen.findByRole('toolbar', { name: 'Mise en forme' });
    expect(screen.queryByText('Une version non enregistrée a été retrouvée.')).toBeNull();
  });
});
