import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { expectAccessible, mockApi, renderApp } from '../../test/render';

const story = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  title: 'La bibliothèque engloutie',
  summary: '',
  author: { handle: 'Ilse.Varenne', displayName: 'Ilse Varenne' },
  language: 'fr',
  rating: 'general',
  status: 'published',
  completion: 'in_progress',
  majorWarnings: [],
  contentWarnings: [],
  tags: ['Romance', 'Slow burn'],
  wordCount: 100,
  chapterCount: 1,
  readCount: 0,
  publishedAt: '2026-10-03T10:00:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
  ...extra,
});
const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const OTHER = '01a102e1-bc65-7d35-b6b2-50377a7804f8';

const paramsOf = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);

describe('filtres de recherche (#32)', () => {
  it('chaque filtre s’applique aussitôt, va dans l’adresse ; nombre annoncé ; accessible', async () => {
    const calls = mockApi((url) =>
      url.startsWith('/api/histoires?')
        ? { body: { items: [story(STORY)], nextCursor: null, total: 12 } }
        : url.startsWith('/api/selections?')
          ? { body: { items: [], nextCursor: null } }
          : undefined,
    );
    const { router } = renderApp('/');
    expect(await screen.findByText('12 histoires')).toBeInstanceOf(HTMLOutputElement);
    await userEvent.click(screen.getByText('Filtres'));

    const tags = screen.getByRole('list', { name: 'Tags à inclure ou exclure' });
    // Un toucher : inclus ; un deuxième : exclu.
    await userEvent.click(within(tags).getByRole('button', { name: 'Romance : ignoré' }));
    await userEvent.click(within(tags).getByRole('button', { name: 'Slow burn : ignoré' }));
    await userEvent.click(within(tags).getByRole('button', { name: 'Slow burn : inclus' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Terminées' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'anglais' }));
    await userEvent.click(screen.getByRole('radio', { name: 'Ado' }));
    await userEvent.click(screen.getByRole('radio', { name: 'De 5 000 à 20 000 mots' }));
    const exclusions = screen.getByRole('group', { name: 'Exclure les histoires qui portent…' });
    await userEvent.click(
      within(exclusions).getByRole('checkbox', { name: 'avertissements non précisés' }),
    );
    await userEvent.click(screen.getByRole('radio', { name: 'Les plus lues' }));

    await waitFor(() =>
      expect(paramsOf(calls.at(-1)!.url)).toEqual({
        limite: '20',
        tags: 'Romance',
        statut: 'completed',
        langues: 'en',
        exclureClassement: 'mature',
        motsMin: '5000',
        motsMax: '19999',
        exclure: 'unspecified',
        masquerTags: 'slow burn',
        tri: 'lecteurs',
      }),
    );
    expect(paramsOf(router.state.location.search)).toEqual({
      tags: 'Romance',
      sans: 'Slow burn',
      statut: 'completed',
      langues: 'en',
      classementMax: 'teen',
      longueur: 'moyenne',
      exclure: 'unspecified',
      tri: 'lecteurs',
    });
    await expectAccessible();

    await userEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.getByRole('button', { name: 'Réinitialiser les filtres' })).toHaveFocus();
  });

  it('adresse partagée : filtres repris ; masquées par une exclusion, signalées avec la raison', async () => {
    const calls = mockApi((url) => {
      if (!url.startsWith('/api/recherche?')) return undefined;
      const { masquerTags } = paramsOf(url);
      return {
        body: masquerTags
          ? { items: [story(STORY)], nextPage: null, total: 1, hidden: 1 }
          : {
              items: [story(STORY), story(OTHER, { title: 'Le phare', tags: ['Horreur'] })],
              nextPage: null,
              total: 2,
            },
      };
    });
    renderApp('/?q=phare&sans=Horreur&tri=longueur&statut=n_importe');
    expect(await screen.findByText('1 résultat')).toBeInTheDocument();
    expect(paramsOf(calls[0]!.url)).toEqual({
      q: 'phare',
      page: '1',
      masquerTags: 'horreur',
      tri: 'longueur',
    });
    expect(screen.getByText('Filtres (actifs)')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Les plus longues' })).toBeChecked();
    // Valeur impossible dans l'adresse : ignorée.
    const status = screen.getByRole('group', { name: 'Statut' });
    expect(within(status).getByRole('radio', { name: 'Toutes' })).toBeChecked();

    expect(screen.getByText('1 histoire masquée par vos limites ou vos filtres.')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Les afficher pour cette fois' }));
    const card = (await screen.findByRole('heading', { name: 'Le phare' })).closest('article')!;
    expect(card).toHaveTextContent('Exclue par vos filtres : tag « Horreur ».');
  });

  it('« Pertinence » : seulement pour une recherche', async () => {
    mockApi((url) =>
      url.startsWith('/api/histoires?') || url.startsWith('/api/recherche?')
        ? { body: { items: [], nextCursor: null, nextPage: null, total: 0 } }
        : url.startsWith('/api/selections?')
          ? { body: { items: [], nextCursor: null } }
          : undefined,
    );
    const { unmount } = renderApp('/');
    await userEvent.click(await screen.findByText('Filtres'));
    expect(screen.queryByRole('radio', { name: 'Pertinence' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Les plus récentes' })).toBeChecked();
    unmount();
    renderApp('/?q=phare');
    await userEvent.click(await screen.findByText('Filtres'));
    expect(screen.getByRole('radio', { name: 'Pertinence' })).toBeChecked();
  });
});
