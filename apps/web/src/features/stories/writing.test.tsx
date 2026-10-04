import type { Editor } from '@tiptap/core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, expectAccessible, mockApi, renderApp, signedIn } from '../../test/render';
import { storyKeys } from './api';

const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const CH = '01a102e1-bc70-7583-8a7d-c381bcb3647a';

const detail = (overrides: Record<string, unknown> = {}) => ({
  id: STORY,
  title: 'Les jardins suspendus',
  summary: 'Des potagers sur les toits.',
  author: { handle: 'ilse', displayName: null },
  language: 'fr',
  rating: 'general',
  status: 'draft',
  completion: 'in_progress',
  majorWarnings: [],
  tags: ['urbain'],
  wordCount: 0,
  chapterCount: 0,
  publishedAt: null,
  updatedAt: '2026-10-04T10:00:00.000Z',
  chapters: [],
  ...overrides,
});

const draft = (text: string, version: number) => ({
  id: CH,
  title: 'Le premier toit',
  status: 'draft',
  draft: {
    type: 'doc',
    content: [
      { type: 'paragraph', attrs: { id: 'bloc-serveur' }, content: [{ type: 'text', text }] },
    ],
  },
  draftVersion: version,
  wordCount: 2,
});

/** Réponse retenue : la sauvegarde ne se termine que quand le test le décide. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** L'éditeur TipTap attaché à la zone d'écriture (TipTap le range sur l'élément). */
async function editorOf(): Promise<Editor> {
  const box = await screen.findByRole('textbox', { name: 'Texte du chapitre' });
  return (box as HTMLElement & { editor: Editor }).editor;
}

const putBodies = (calls: ReturnType<typeof mockApi>) =>
  calls.filter((c) => c.method === 'PUT').map((c) => c.body as { version: number; draft: unknown });

describe('atelier : informations d’une histoire', () => {
  it('nouvelle histoire : erreurs reliées aux champs, focus, page accessible', async () => {
    signedIn();
    mockApi((url) => (url === '/api/moi/compte' ? { body: account() } : undefined));
    renderApp('/ecrire/nouvelle');
    await userEvent.click(await screen.findByRole('button', { name: 'Créer l’histoire' }));
    const title = screen.getByRole('textbox', { name: /^Titre.*obligatoire/ });
    await waitFor(() => expect(title).toHaveFocus());
    expect(title).toHaveAttribute('aria-invalid', 'true');
    await expectAccessible();
  });

  it('avertissements : un choix incohérent est refusé, sans envoi', async () => {
    signedIn();
    const calls = mockApi((url) => (url === '/api/moi/compte' ? { body: account() } : undefined));
    renderApp('/ecrire/nouvelle');
    await userEvent.type(
      await screen.findByRole('textbox', { name: /^Titre.*obligatoire/ }),
      'Lucioles',
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Aucun avertissement majeur' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'mort d’un personnage' }));
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’histoire' }));
    expect(await screen.findByText(/Choisissez une seule possibilité/)).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('création : « aucun avertissement » envoie une liste vide ; sans choix, rien n’est déclaré (null)', async () => {
    signedIn();
    const calls = mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === '/api/histoires' && init.method === 'POST')
        return { status: 201, body: detail() };
      if (url === `/api/histoires/${STORY}`) return { body: detail() };
    });
    renderApp('/ecrire/nouvelle');
    await userEvent.type(
      await screen.findByRole('textbox', { name: /^Titre.*obligatoire/ }),
      'Lucioles',
    );
    await userEvent.click(screen.getByRole('radio', { name: /Tout public/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Aucun avertissement majeur' }));
    await userEvent.type(screen.getByRole('textbox', { name: /Tags/ }), 'fantasy, nuit');
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’histoire' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Les jardins suspendus' }),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      title: 'Lucioles',
      rating: 'general',
      majorWarnings: [],
      tags: ['fantasy', 'nuit'],
    });
  });

  it('modification après création : le formulaire reprend les valeurs et envoie un PATCH', async () => {
    signedIn();
    const calls = mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}` && init.method === 'PATCH') {
        return { body: detail({ rating: 'teen' }) };
      }
      if (url === `/api/histoires/${STORY}`) return { body: detail() };
    });
    renderApp(`/ecrire/histoires/${STORY}`);
    await userEvent.click(await screen.findByText(/Modifier les informations/));
    expect(screen.getByRole('textbox', { name: /^Titre.*obligatoire/ })).toHaveValue(
      'Les jardins suspendus',
    );
    expect(screen.getByRole('checkbox', { name: 'Aucun avertissement majeur' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /Ado/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer les informations' }));
    expect(await screen.findByText('Informations enregistrées.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
      rating: 'teen',
      majorWarnings: [],
    });
    await expectAccessible();
  });
});

describe('éditeur : sauvegardes sans perte', () => {
  const base = (
    put: (body: {
      version: number;
    }) => Promise<{ status?: number; body?: unknown }> | { status?: number; body?: unknown },
  ) =>
    mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url.endsWith('/brouillon') && init.method === 'PUT') {
        return put(JSON.parse(String(init.body)) as { version: number });
      }
      if (url.endsWith('/brouillon')) return { body: draft('Début.', 3) };
      if (url.endsWith('/publication')) return { status: 201, body: detail() };
      if (url === `/api/histoires/${STORY}`) return { body: detail() };
    });

  it('frappe pendant un envoi : une seule sauvegarde à la fois, la suivante part avec la nouvelle version', async () => {
    signedIn();
    const first = deferred<{ body: unknown }>();
    let n = 0;
    const calls = base(() =>
      ++n === 1 ? first.promise : { body: { draftVersion: 5, wordCount: 3, draft: null } },
    );
    const { queryClient } = renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    const editor = await editorOf();
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' A');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' B');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    // Le second envoi attend le premier.
    expect(putBodies(calls)).toHaveLength(1);
    first.resolve({ body: { draftVersion: 4, wordCount: 2, draft: null } });
    await waitFor(() => expect(putBodies(calls)).toHaveLength(2));
    const [one, two] = putBodies(calls);
    expect(one!.version).toBe(3);
    expect(two!.version).toBe(4);
    expect(JSON.stringify(two!.draft)).toContain('Début. A B');
    await waitFor(() => expect(screen.getByText(/^Enregistré à/)).toBeInTheDocument());
    // Le cache du brouillon suit : rouvrir le chapitre montrera la dernière version.
    const cached = queryClient.getQueryData<{ draftVersion: number }>(storyKeys.draft(STORY, CH));
    expect(cached?.draftVersion).toBe(5);
  });

  it('quitter la page avec une modification : enregistrée avant de partir', async () => {
    signedIn();
    const calls = base(() => ({ body: { draftVersion: 4, wordCount: 3, draft: null } }));
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    const editor = await editorOf();
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' fin');
    await userEvent.click(screen.getByRole('link', { name: 'Retour à l’histoire' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Les jardins suspendus' }),
    ).toBeInTheDocument();
    expect(putBodies(calls)).toHaveLength(1);
    expect(JSON.stringify(putBodies(calls)[0]!.draft)).toContain('Début. fin');
  });

  it('conflit : « Garder ma version » renvoie le texte avec la version enregistrée ailleurs', async () => {
    signedIn();
    let n = 0;
    const calls = mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url.endsWith('/brouillon') && init.method === 'PUT') {
        return ++n === 1
          ? { status: 409, body: { type: 'brouillon-modifie', title: 'Conflit', status: 409 } }
          : { body: { draftVersion: 8, wordCount: 3, draft: null } };
      }
      if (url.endsWith('/brouillon')) {
        // Premier chargement en v3 ; relecture après le conflit : v7, enregistrée ailleurs.
        return {
          body:
            calls.filter((c) => c.url.endsWith('/brouillon') && c.method === 'GET').length > 1
              ? draft('Autre.', 7)
              : draft('Début.', 3),
        };
      }
      if (url === `/api/histoires/${STORY}`) return { body: detail() };
    });
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    const editor = await editorOf();
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' mien');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Garder ma version' }));
    await waitFor(() => expect(putBodies(calls)).toHaveLength(2));
    expect(putBodies(calls)[1]!.version).toBe(7);
    expect(JSON.stringify(putBodies(calls)[1]!.draft)).toContain('Début. mien');
    await waitFor(() => expect(screen.queryByText(/enregistré ailleurs/)).toBeNull());
  });

  it('publier pendant une sauvegarde : attend la fin, une seule sauvegarde, puis publie', async () => {
    signedIn();
    const first = deferred<{ body: unknown }>();
    const calls = base(() => first.promise);
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    const editor = await editorOf();
    editor.commands.insertContentAt(editor.state.doc.content.size - 1, ' A');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Publier le chapitre' }));
    expect(calls.some((c) => c.url.endsWith('/publication'))).toBe(false);
    first.resolve({ body: { draftVersion: 4, wordCount: 3, draft: null } });
    // Le bouton était indisponible pendant la sauvegarde : on publie une fois enregistré.
    await waitFor(() => expect(screen.getByText(/^Enregistré à/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Publier le chapitre' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/publication'))).toBe(true));
    expect(putBodies(calls)).toHaveLength(1);
  });
});
