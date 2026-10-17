import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, expectAccessible, mockApi, renderApp, signedIn } from '../../test/render';

const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const SEL = '01a102e1-0000-7000-8000-00000000c0de';
const story = {
  id: STORY,
  title: 'La bibliothèque engloutie',
  summary: '',
  author: { handle: 'Ilse.Varenne', displayName: 'Ilse Varenne' },
  language: 'fr',
  rating: 'general',
  status: 'published',
  completion: 'in_progress',
  majorWarnings: [],
  contentWarnings: [],
  tags: [],
  wordCount: 100,
  chapterCount: 0,
  readCount: 0,
  publishedAt: '2026-10-03T10:00:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
};
const selection = (extra: Record<string, unknown> = {}) => ({
  id: SEL,
  title: 'Pour les nuits blanches',
  description: 'Des histoires à lire tard.',
  visibility: 'public',
  owner: { handle: 'ilse', displayName: null },
  storyCount: 1,
  updatedAt: '2026-10-17T10:00:00.000Z',
  ...extra,
});

describe('sélections (#30)', () => {
  it('page publique partageable : histoires et autrice ou auteur ; accessible sans compte', async () => {
    mockApi((url) =>
      url === `/api/selections/${SEL}`
        ? { body: { ...selection(), stories: [story], mine: false } }
        : undefined,
    );
    renderApp(`/selections/${SEL}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pour les nuits blanches' }),
    ).toBeInTheDocument();
    const list = screen.getByRole('list', {
      name: 'Histoires de la sélection Pour les nuits blanches',
    });
    expect(
      within(list).getByRole('link', { name: 'La bibliothèque engloutie' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Modifier la sélection')).toBeNull();
    await expectAccessible();
  });

  it('sélection privée (ou inconnue) : « Sélection introuvable »', async () => {
    mockApi(() => undefined);
    renderApp(`/selections/${SEL}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sélection introuvable' }),
    ).toBeInTheDocument();
  });

  it('fiche : créer une sélection et y ranger l’histoire ; la retirer d’une autre', async () => {
    signedIn();
    const OTHER = '01a102e1-0000-7000-8000-00000000beef';
    const calls = mockApi((url, init) => {
      const method = init.method ?? 'GET';
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}`) return { body: { ...story, chapters: [] } };
      if (url === `/api/moi/lectures/${STORY}`) return { body: { entry: null } };
      if (url === `/api/moi/selections?histoire=${STORY}`) {
        return {
          body: {
            items: [{ ...selection({ id: OTHER, title: 'Déjà là' }), preview: [], contains: true }],
            nextCursor: null,
          },
        };
      }
      if (url === '/api/moi/selections' && method === 'POST') {
        return {
          status: 201,
          body: { ...selection({ visibility: 'private', storyCount: 0 }), stories: [], mine: true },
        };
      }
      if (url.startsWith('/api/moi/selections/')) {
        return { body: { ...selection(), stories: [story], mine: true } };
      }
      return undefined;
    });
    renderApp(`/histoires/${STORY}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Ajouter à une sélection' }));
    const dialog = await screen.findByRole('dialog', { name: 'Ajouter à une sélection' });
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'Déjà là' }));
    await userEvent.type(
      within(dialog).getByRole('textbox', { name: 'Nouvelle sélection' }),
      'Pour les nuits blanches',
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Créer et y ajouter l’histoire' }),
    );
    await waitFor(() =>
      expect(calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.url])).toEqual([
        ['DELETE', `/api/moi/selections/${OTHER}/histoires/${STORY}`],
        ['POST', '/api/moi/selections'],
        ['PUT', `/api/moi/selections/${SEL}/histoires/${STORY}`],
      ]),
    );
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      title: 'Pour les nuits blanches',
      visibility: 'private',
    });
  });

  it('sa sélection : la rendre publique, retirer une histoire, la supprimer', async () => {
    signedIn();
    const calls = mockApi((url, init) => {
      const method = init.method ?? 'GET';
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/selections/${SEL}`) {
        return {
          body: { ...selection({ visibility: 'private' }), stories: [story], mine: true },
        };
      }
      if (url === `/api/moi/selections/${SEL}` && method === 'DELETE') return { status: 204 };
      if (url.startsWith('/api/moi/selections/')) {
        return { body: { ...selection(), stories: [], mine: true } };
      }
      if (url.startsWith('/api/moi/lectures')) return { body: { items: [], nextCursor: null } };
      if (url === '/api/moi/selections') return { body: { items: [], nextCursor: null } };
      return undefined;
    });
    const { router } = renderApp(`/selections/${SEL}`);
    await userEvent.click(await screen.findByText('Modifier la sélection'));
    await userEvent.click(screen.getByRole('radio', { name: /Publique/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ visibility: 'public' }),
    );
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Retirer « La bibliothèque engloutie » de la sélection',
      }),
    );
    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.method === 'DELETE' && c.url === `/api/moi/selections/${SEL}/histoires/${STORY}`,
        ),
      ).toBe(true),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer la sélection' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Supprimer' }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/mes-lectures'));
  });

  it('Explorer : étagères des membres', async () => {
    mockApi((url) => {
      if (url.startsWith('/api/selections?')) {
        return { body: { items: [{ ...selection(), preview: [story] }], nextCursor: null } };
      }
      if (url.startsWith('/api/histoires?')) return { body: { items: [], nextCursor: null } };
      return undefined;
    });
    renderApp('/');
    const shelves = await screen.findByRole('list', { name: 'Sélections des membres' });
    expect(within(shelves).getByRole('link', { name: 'Pour les nuits blanches' })).toHaveAttribute(
      'href',
      `/selections/${SEL}`,
    );
    expect(within(shelves).getByText('Avec : La bibliothèque engloutie')).toBeInTheDocument();
  });
});
