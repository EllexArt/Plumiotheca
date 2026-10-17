import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, expectAccessible, mockApi, renderApp, signedIn } from '../../test/render';

const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
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
  chapterCount: 1,
  readCount: 0,
  publishedAt: '2026-10-03T10:00:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
};

/** Paramètre « exclureAutres » d'un appel (null s'il n'y en a pas). */
const excluded = (url: string) => new URL(url, 'http://x').searchParams.get('exclureAutres');

describe('Mes limites : masquer des avertissements facultatifs (#152)', () => {
  it('sans compte : masqués aussitôt pour la session, nombre annoncé ; panneau accessible', async () => {
    const calls = mockApi((url) => {
      if (url.startsWith('/api/histoires?')) {
        const hiding = excluded(url);
        return {
          body: { items: [story], nextCursor: null, ...(hiding ? { hidden: 2 } : {}) },
        };
      }
      return undefined;
    });
    renderApp('/');
    await screen.findByRole('list', { name: 'Dernières histoires publiées' });
    await userEvent.click(screen.getByText('Masquer certains sujets'));
    const group = screen.getByRole('group', { name: 'Masquer les histoires qui abordent…' });
    expect(group).toHaveTextContent('Pour cette visite seulement');
    await userEvent.click(within(group).getByRole('checkbox', { name: 'deuil' }));
    await userEvent.click(within(group).getByRole('checkbox', { name: 'suicide' }));

    const note = await screen.findByText('2 histoires masquées par vos limites.');
    expect(note).toBeInstanceOf(HTMLOutputElement);
    expect(excluded(calls.at(-1)!.url)).toBe('grief,suicide');
    expect(sessionStorage.getItem('plumiotheca.limites')).toBe('["grief","suicide"]');
    await expectAccessible();
  });

  it('avec un compte : limites du compte dès la première liste ; un changement est enregistré', async () => {
    signedIn();
    const calls = mockApi((url, init) => {
      if (url === '/api/moi/compte') {
        return { body: account({ limits: { hiddenContentWarnings: ['grief'] } }) };
      }
      if (url === '/api/moi/compte/limites') {
        return {
          body: account({ limits: JSON.parse(String(init.body)) as unknown }),
        };
      }
      if (url.startsWith('/api/histoires?')) {
        return { body: { items: [story], nextCursor: null, hidden: 1 } };
      }
      return undefined;
    });
    renderApp('/');
    await screen.findByText('1 histoire masquée par vos limites.');
    // Aucune liste demandée avant de connaître les limites du compte.
    const lists = calls.filter((c) => c.url.startsWith('/api/histoires?'));
    expect(lists.every((c) => excluded(c.url) === 'grief')).toBe(true);

    await userEvent.click(screen.getByText('Masquer certains sujets'));
    const group = screen.getByRole('group', { name: 'Masquer les histoires qui abordent…' });
    expect(group).toHaveTextContent('Gardé sur votre compte');
    expect(within(group).getByRole('checkbox', { name: 'deuil' })).toBeChecked();
    await userEvent.click(within(group).getByRole('checkbox', { name: 'addictions' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({
        hiddenContentWarnings: ['grief', 'addiction'],
      }),
    );
    await waitFor(() => expect(excluded(calls.at(-1)!.url)).toBe('grief,addiction'));
  });

  it('la recherche applique les mêmes limites', async () => {
    sessionStorage.setItem('plumiotheca.limites', '["medical"]');
    const calls = mockApi((url) =>
      url.startsWith('/api/recherche?')
        ? { body: { items: [story], total: 1, nextPage: null, hidden: 3 } }
        : undefined,
    );
    renderApp('/?q=bibliotheque');
    await screen.findByText('3 histoires masquées par vos limites.');
    expect(excluded(calls.find((c) => c.url.startsWith('/api/recherche?'))!.url)).toBe('medical');
  });

  it('paramètres du compte : rubrique « Mes limites »', async () => {
    signedIn();
    mockApi((url) => (url === '/api/moi/compte' ? { body: account() } : undefined));
    renderApp('/compte');
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Mes limites' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Masquer les histoires qui abordent…' }),
    ).toBeInTheDocument();
  });
});
