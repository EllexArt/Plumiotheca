import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, expectAccessible, mockApi, renderApp, signedIn } from '../../test/render';

const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const story = (extra: Record<string, unknown> = {}) => ({
  id: STORY,
  title: 'Les marées',
  summary: '',
  author: { handle: 'ilse', displayName: null },
  language: 'fr',
  rating: 'general',
  status: 'published',
  completion: 'in_progress',
  majorWarnings: [],
  contentWarnings: [],
  tags: ['fantasy'],
  relationships: ['Ilse/Tomas', 'Ilse & sa mère'],
  characters: ['Ilse', 'Tomas', 'sa mère'],
  wordCount: 100,
  chapterCount: 0,
  readCount: 0,
  publishedAt: '2026-10-03T10:00:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
  ...extra,
});

describe('personnages et relations (#79)', () => {
  it('écrire : relations et personnages envoyés ; une relation mal écrite est refusée', async () => {
    signedIn();
    const calls = mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === '/api/histoires' && init.method === 'POST') {
        return { status: 201, body: { ...story({ status: 'draft' }), chapters: [] } };
      }
      if (url === `/api/histoires/${STORY}`) return { body: { ...story(), chapters: [] } };
      return undefined;
    });
    renderApp('/ecrire/nouvelle');
    await userEvent.type(
      await screen.findByRole('textbox', { name: /^Titre.*obligatoire/ }),
      'Les marées',
    );
    const relations = screen.getByRole('textbox', { name: 'Relations' });
    await userEvent.type(relations, 'Ilse');
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’histoire' }));
    await waitFor(() => expect(relations).toHaveAttribute('aria-invalid', 'true'));
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    await userEvent.clear(relations);
    await userEvent.type(relations, 'Ilse/Tomas, Ilse & sa mère');
    await userEvent.type(screen.getByRole('textbox', { name: 'Personnages' }), 'Mia');
    await userEvent.click(screen.getByRole('button', { name: 'Créer l’histoire' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
        relationships: ['Ilse/Tomas', 'Ilse & sa mère'],
        characters: ['Mia'],
      }),
    );
  });

  it('lire : relations avant les tags sur la carte ; personnages sur la fiche, chacun un filtre', async () => {
    mockApi((url) => {
      if (url.startsWith('/api/histoires?')) {
        return { body: { items: [story()], nextCursor: null, total: 1 } };
      }
      if (url === `/api/histoires/${STORY}`) return { body: { ...story(), chapters: [] } };
      if (url.startsWith('/api/selections?')) return { body: { items: [], nextCursor: null } };
      return undefined;
    });
    renderApp('/');
    const card = (await screen.findByRole('heading', { name: 'Les marées' })).closest('article')!;
    const labels = within(
      within(card).getByRole('list', { name: 'Classement, avertissements, relations et tags' }),
    )
      .getAllByRole('link')
      .map((link) => link.textContent?.trim());
    expect(labels).toEqual([
      'Histoires avec la relation Ilse/Tomas',
      'Histoires avec la relation Ilse & sa mère',
      'Histoires avec le tag fantasy',
    ]);
    expect(
      within(card).getByRole('link', { name: 'Histoires avec la relation Ilse/Tomas' }),
    ).toHaveAttribute('href', `/?relations=${encodeURIComponent('Ilse/Tomas')}`);

    await userEvent.click(within(card).getByRole('link', { name: 'Les marées' }));
    expect(await screen.findByText(/Personnages :/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'sa mère' })).toHaveAttribute(
      'href',
      `/?personnages=${encodeURIComponent('sa mère')}`,
    );
    await expectAccessible();
  });

  it('filtres : facettes avec leur nombre d’histoires ; cocher filtre et va dans l’adresse', async () => {
    const calls = mockApi((url) => {
      if (url.startsWith('/api/histoires?')) {
        return {
          body: {
            items: [story()],
            nextCursor: null,
            total: 3,
            facets: {
              relationships: [
                { name: 'Ilse/Tomas', stories: 2 },
                { name: 'Ilse & sa mère', stories: 1 },
              ],
              characters: [{ name: 'Ilse', stories: 3 }],
            },
          },
        };
      }
      if (url.startsWith('/api/selections?')) return { body: { items: [], nextCursor: null } };
      return undefined;
    });
    const { router } = renderApp('/');
    await userEvent.click(await screen.findByText('Filtres'));
    const relations = screen.getByRole('group', { name: 'Relations' });
    await userEvent.click(
      within(relations).getByRole('checkbox', { name: 'Ilse/Tomas (2 histoires)' }),
    );
    await waitFor(() =>
      expect(new URL(calls.at(-1)!.url, 'http://x').searchParams.get('relations')).toBe(
        'Ilse/Tomas',
      ),
    );
    expect(new URLSearchParams(router.state.location.search).get('relations')).toBe('Ilse/Tomas');
    expect(
      within(screen.getByRole('group', { name: 'Personnages' })).getByRole('checkbox', {
        name: 'Ilse (3 histoires)',
      }),
    ).not.toBeChecked();
    await expectAccessible();
  });
});
