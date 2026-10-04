import type { Editor } from '@tiptap/core';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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

describe('éditeur : gardes « aucune perte » (contre-vérification)', () => {
  type PutReply =
    { status?: number; body?: unknown } | Promise<{ status?: number; body?: unknown }>;
  function api(put: (n: number) => PutReply, extra?: (url: string, init: RequestInit) => unknown) {
    let n = 0;
    return mockApi((url, init) => {
      const more = extra?.(url, init);
      if (more) return more as { body: unknown };
      if (url === '/api/moi/compte') return { body: account() };
      if (url.endsWith('/brouillon') && init.method === 'PUT') return put(++n);
      if (url.endsWith('/brouillon')) return { body: draft('Début.', 3) };
      if (url.endsWith('/publication')) return { status: 201, body: detail() };
      if (url.includes('/chapitres/') && init.method === 'PATCH') return { status: 204 };
      if (url === `/api/histoires/${STORY}`) return { body: detail() };
    });
  }
  const saved = (version: number, doc: unknown = null) => ({
    body: { draftVersion: version, wordCount: 3, draft: doc },
  });
  const end = (editor: Editor) => editor.state.doc.content.size - 1;

  it('frappe pendant un envoi, sans second clic : pas d’« Enregistré » trompeur, la sauvegarde automatique suit', async () => {
    signedIn();
    const first = deferred<{ body: unknown }>();
    const calls = api((n) => (n === 1 ? first.promise : saved(5)));
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    const editor = await editorOf();
    editor.commands.insertContentAt(end(editor), ' A');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    editor.commands.insertContentAt(end(editor), ' B');
    first.resolve(saved(4));
    await waitFor(() => expect(putBodies(calls)).toHaveLength(1));
    expect(screen.queryByText(/^Enregistré à/)).toBeNull();
    // Copie de secours réécrite avec la nouvelle version.
    const backup = JSON.parse(sessionStorage.getItem(`plumiotheca.brouillon.${CH}`) ?? '{}') as {
      version?: number;
    };
    expect(backup.version).toBe(4);
    await waitFor(() => expect(putBodies(calls)).toHaveLength(2), { timeout: 4000 });
    expect(putBodies(calls)[1]!.version).toBe(4);
    expect(JSON.stringify(putBodies(calls)[1]!.draft)).toContain('Début. A B');
    await waitFor(() => expect(screen.getByText(/^Enregistré à/)).toBeInTheDocument());
  });

  it('document complété par l’API pendant une frappe : le texte tapé n’est pas écrasé', async () => {
    signedIn();
    const first = deferred<{ body: unknown }>();
    const calls = api((n) => (n === 1 ? first.promise : saved(5)));
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    const editor = await editorOf();
    editor.commands.insertContentAt(end(editor), ' A');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    editor.commands.insertContentAt(end(editor), ' B');
    first.resolve(saved(4, draft('Début. A', 4).draft));
    await waitFor(() => expect(putBodies(calls)).toHaveLength(1));
    expect(editor.getText()).toContain('Début. A B');
    await waitFor(() => expect(putBodies(calls)).toHaveLength(2), { timeout: 4000 });
    expect(JSON.stringify(putBodies(calls)[1]!.draft)).toContain('Début. A B');
  });

  it('publier sans avoir enregistré : la modification part d’abord, puis la publication', async () => {
    signedIn();
    const calls = api(() => saved(4));
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    const editor = await editorOf();
    editor.commands.insertContentAt(end(editor), ' fin');
    await userEvent.click(screen.getByRole('button', { name: 'Publier le chapitre' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/publication'))).toBe(true));
    const order = calls
      .filter((c) => c.method !== 'GET')
      .map((c) => (c.method === 'PUT' ? 'brouillon' : 'publication'));
    expect(order).toEqual(['brouillon', 'publication']);
  });

  it('conflit puis « Charger la version enregistrée » : mon texte reste proposé en reprise', async () => {
    signedIn();
    const calls = api(
      () => ({ status: 409, body: { type: 'brouillon-modifie', title: 'Conflit', status: 409 } }),
      (url, init) =>
        url.endsWith('/brouillon') &&
        (init.method ?? 'GET') === 'GET' &&
        calls.filter((c) => c.url.endsWith('/brouillon') && c.method === 'GET').length > 1
          ? { body: draft('Version d’ailleurs.', 7) }
          : undefined,
    );
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    const editor = await editorOf();
    editor.commands.insertContentAt(end(editor), ' mien');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await userEvent.click(
      await screen.findByRole('button', { name: 'Charger la version enregistrée' }),
    );
    await waitFor(() => expect(editor.getText()).toBe('Version d’ailleurs.'));
    expect(
      await screen.findByText('Une version non enregistrée a été retrouvée.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Reprendre cette version' }));
    expect(editor.getText()).toBe('Début. mien');
  });

  it('conflit puis rechargement de la page : la copie de l’onglet est proposée, avec un avertissement', async () => {
    signedIn();
    api(() => ({
      status: 409,
      body: { type: 'brouillon-modifie', title: 'Conflit', status: 409 },
    }));
    const first = renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    const editor = await editorOf();
    editor.commands.insertContentAt(end(editor), ' mien');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await screen.findByRole('button', { name: 'Garder ma version' });
    first.unmount();
    // Rechargement : le serveur a avancé (v7).
    mockApi((url) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url.endsWith('/brouillon')) return { body: draft('Version d’ailleurs.', 7) };
      if (url === `/api/histoires/${STORY}`) return { body: detail() };
    });
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    expect(
      await screen.findByText('Une version non enregistrée a été retrouvée.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/reprendre celle-ci la remplacera/)).toBeInTheDocument();
  });

  it('titre : enregistré une fois quand il change, rien si on sort du champ sans changement', async () => {
    signedIn();
    const calls = api(() => saved(4));
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    await editorOf();
    const field = screen.getByRole('textbox', { name: 'Titre du chapitre' });
    await userEvent.click(field);
    await userEvent.tab();
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(0);
    await userEvent.clear(field);
    await userEvent.type(field, 'Le second toit');
    await userEvent.tab();
    await waitFor(() => expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ title: 'Le second toit' });
    await userEvent.click(field);
    await userEvent.tab();
    expect(calls.filter((c) => c.method === 'PATCH')).toHaveLength(1);
  });

  it('refus 400 : la raison donnée par l’API est affichée', async () => {
    signedIn();
    api(() => ({
      status: 400,
      body: {
        type: 'validation',
        title: 'Requête invalide',
        status: 400,
        errors: [{ path: 'draft', message: 'Caractère de contrôle interdit', code: 'custom' }],
      },
    }));
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    const editor = await editorOf();
    editor.commands.insertContentAt(end(editor), ' x');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/Caractère de contrôle interdit/)).toBeInTheDocument();
  });
});

describe('éditeur : seconde contre-vérification', () => {
  function api(put: () => { status?: number; body?: unknown }) {
    return mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url.endsWith('/brouillon') && init.method === 'PUT') return put();
      if (url.endsWith('/brouillon')) return { body: draft('Début.', 3) };
      if (url.endsWith('/publication')) return { status: 201, body: detail() };
      if (url === `/api/histoires/${STORY}`) return { body: detail() };
    });
  }
  const end = (editor: Editor) => editor.state.doc.content.size - 1;
  const lost = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { id: 'bloc-serveur' },
        content: [{ type: 'text', text: 'Version perdue.' }],
      },
    ],
  };

  it('copie proposée : la frappe et la sauvegarde ne l’écrasent pas, elle reste après un rechargement', async () => {
    signedIn();
    sessionStorage.setItem(
      `plumiotheca.brouillon.${CH}`,
      JSON.stringify({ version: 3, doc: lost, at: '2026-10-04T09:00:00.000Z' }),
    );
    const calls = api(() => ({ body: { draftVersion: 4, wordCount: 2, draft: null } }));
    const first = renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    expect(
      await screen.findByText('Une version non enregistrée a été retrouvée.'),
    ).toBeInTheDocument();
    // On écrit sans choisir, puis on enregistre.
    const editor = await editorOf();
    editor.commands.insertContentAt(end(editor), ' suite');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.getByText(/^Enregistré à/)).toBeInTheDocument());
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    first.unmount();
    // Rechargement : la copie est toujours proposée, et se reprend.
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Reprendre cette version' }));
    expect((await editorOf()).getText()).toBe('Version perdue.');
    expect(sessionStorage.getItem(`plumiotheca.brouillon.${CH}.proposee`)).toBeNull();
  });

  it('identifiants complétés par l’API, sans frappe : « Enregistré », et « Publier » publie', async () => {
    signedIn();
    // L'API a départagé un identifiant : son document diffère de celui de l'éditeur.
    const completed = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'bloc-complete' },
          content: [{ type: 'text', text: 'Début. fin' }],
        },
      ],
    };
    const calls = api(() => ({ body: { draftVersion: 4, wordCount: 2, draft: completed } }));
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    const editor = await editorOf();
    editor.commands.insertContentAt(end(editor), ' fin');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(screen.getByText(/^Enregistré à/)).toBeInTheDocument());
    // La reprise du document n'est pas une frappe : aucune sauvegarde automatique ne suit.
    await new Promise((resolve) => setTimeout(resolve, 2500));
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
    expect(screen.getByText(/^Enregistré à/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publier le chapitre' }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/publication'))).toBe(true));
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1);
  }, 10_000);

  it('quitter alors que l’enregistrement est impossible : confirmation (non → on reste, oui → on part)', async () => {
    signedIn();
    api(() => ({
      status: 400,
      body: { type: 'validation', title: 'Requête invalide', status: 400 },
    }));
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderApp(`/ecrire/histoires/${STORY}/chapitres/${CH}`);
    const editor = await editorOf();
    editor.commands.insertContentAt(end(editor), ' x');
    await userEvent.click(screen.getByRole('link', { name: 'Retour à l’histoire' }));
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('textbox', { name: 'Texte du chapitre' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Retour à l’histoire' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Les jardins suspendus' }),
    ).toBeInTheDocument();
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
