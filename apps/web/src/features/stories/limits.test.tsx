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
    expect(screen.getByText(/Pour cette visite seulement/)).toBeInTheDocument();
    await userEvent.click(within(group).getByRole('checkbox', { name: 'deuil' }));
    await userEvent.click(within(group).getByRole('checkbox', { name: 'suicide' }));

    const note = await screen.findByText('2 histoires masquées par vos limites.');
    expect(note).toBeInstanceOf(HTMLOutputElement);
    expect(excluded(calls.at(-1)!.url)).toBe('grief,suicide');
    expect(JSON.parse(sessionStorage.getItem('plumiotheca.limites')!)).toEqual({
      hiddenContentWarnings: ['grief', 'suicide'],
      hiddenMajorWarnings: [],
      hiddenTags: [],
    });
    await expectAccessible();
  });

  it('avec un compte : limites du compte dès la première liste ; un changement est enregistré', async () => {
    signedIn();
    const calls = mockApi((url, init) => {
      if (url === '/api/moi/compte') {
        return {
          body: account({
            limits: { hiddenContentWarnings: ['grief'], hiddenMajorWarnings: [], hiddenTags: [] },
          }),
        };
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
    expect(screen.getByText(/Gardé sur votre compte/)).toBeInTheDocument();
    expect(within(group).getByRole('checkbox', { name: 'deuil' })).toBeChecked();
    await userEvent.click(within(group).getByRole('checkbox', { name: 'addictions' }));
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({
        hiddenContentWarnings: ['grief', 'addiction'],
        hiddenMajorWarnings: [],
        hiddenTags: [],
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

describe('Mes limites permanentes (#81)', () => {
  const params = (url: string) => new URL(url, 'http://x').searchParams;

  it('avertissements majeurs et tags masqués : envoyés à chaque liste ; tag retiré', async () => {
    const calls = mockApi((url) =>
      url.startsWith('/api/histoires?')
        ? { body: { items: [story], nextCursor: null } }
        : undefined,
    );
    renderApp('/');
    await screen.findByRole('list', { name: 'Dernières histoires publiées' });
    await userEvent.click(screen.getByText('Masquer certains sujets'));
    const majors = screen.getByRole('group', {
      name: '… ou qui portent ces avertissements majeurs',
    });
    await userEvent.click(within(majors).getByRole('checkbox', { name: 'mort d’un personnage' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Masquer un tag' }), 'Slow-Burn');
    await userEvent.click(screen.getByRole('button', { name: 'Masquer ce tag' }));
    await waitFor(() => {
      const last = params(calls.at(-1)!.url);
      expect([last.get('exclure'), last.get('masquerTags')]).toEqual([
        'character_death',
        'slow burn',
      ]);
    });
    const tags = screen.getByRole('list', { name: 'Tags masqués' });
    await userEvent.click(
      within(tags).getByRole('button', { name: 'Retirer le tag « slow burn »' }),
    );
    expect(screen.getByText('Aucun tag masqué.')).toBeInTheDocument();
    await expectAccessible();
  });

  it('ce qui est masqué reste consultable : « Les afficher pour cette fois », avec la raison', async () => {
    sessionStorage.setItem(
      'plumiotheca.limites',
      JSON.stringify({ hiddenContentWarnings: ['grief'], hiddenMajorWarnings: [], hiddenTags: [] }),
    );
    const masked = {
      ...story,
      id: '01a102e1-0000-7000-8000-00000000dead',
      title: 'Le deuil',
      contentWarnings: ['grief'],
    };
    const calls = mockApi((url) => {
      if (!url.startsWith('/api/histoires?')) return undefined;
      return params(url).get('exclureAutres')
        ? { body: { items: [story], nextCursor: null, hidden: 1 } }
        : { body: { items: [story, masked], nextCursor: null } };
    });
    renderApp('/');
    await screen.findByText('1 histoire masquée par vos limites.');
    await userEvent.click(screen.getByRole('button', { name: 'Les afficher pour cette fois' }));
    const card = (await screen.findByRole('link', { name: 'Le deuil' })).closest('article')!;
    expect(card).toHaveTextContent('Masquée d’habitude par vos limites : deuil.');
    expect(params(calls.at(-1)!.url).get('exclureAutres')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Les masquer de nouveau' }));
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Le deuil' })).toBeNull());
  });

  it('sélections : les histoires masquées n’y apparaissent pas non plus', async () => {
    sessionStorage.setItem(
      'plumiotheca.limites',
      JSON.stringify({
        hiddenContentWarnings: [],
        hiddenMajorWarnings: [],
        hiddenTags: ['romance'],
      }),
    );
    const SEL = '01a102e1-0000-7000-8000-00000000c0de';
    const tagged = {
      ...story,
      id: '01a102e1-0000-7000-8000-00000000beef',
      title: 'Amours',
      tags: ['Romance'],
    };
    mockApi((url) =>
      url === `/api/selections/${SEL}`
        ? {
            body: {
              id: SEL,
              title: 'Étagère',
              description: '',
              visibility: 'public',
              owner: { handle: 'ilse', displayName: null },
              storyCount: 2,
              updatedAt: '2026-10-17T10:00:00.000Z',
              stories: [story, tagged],
              mine: false,
            },
          }
        : undefined,
    );
    renderApp(`/selections/${SEL}`);
    await screen.findByText('1 histoire masquée par vos limites.');
    expect(screen.queryByRole('link', { name: 'Amours' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Les afficher pour cette fois' }));
    expect(
      (await screen.findByRole('link', { name: 'Amours' })).closest('article'),
    ).toHaveTextContent('Masquée d’habitude par vos limites : tag « Romance ».');
  });
});
