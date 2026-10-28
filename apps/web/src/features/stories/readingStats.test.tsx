import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { account, expectAccessible, mockApi, renderApp, signedIn } from '../../test/render';
import { formatMinutes } from './readingStats';

const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const CHAPTER = '01a102e1-bc70-7583-8a7d-c381bcb3647a';
const stats = {
  finished: 4,
  reading: 2,
  toRead: 1,
  chaptersRead: 37,
  wordsRead: 81_250,
  minutesThisMonth: 200,
  minutesThisYear: 1_505,
  minutesTotal: 1_505,
  months: Array.from({ length: 12 }, (_, i) => ({
    month: `2026-${String(i + 1).padStart(2, '0')}`,
    minutes: i === 9 ? 200 : 0,
  })),
};

/** Compte connecté, bilan activé ou non ; Mes lectures vide. */
function withAccount(readingStats = true) {
  signedIn();
  return mockApi((url, init) => {
    const method = init.method ?? 'GET';
    if (url === '/api/moi/compte' && method === 'GET') return { body: account({ readingStats }) };
    if (url === '/api/moi/compte/bilan') {
      return {
        body: account({
          readingStats: (JSON.parse(String(init.body)) as { readingStats: boolean }).readingStats,
        }),
      };
    }
    if (url === '/api/moi/bilan') return { body: stats };
    if (url === '/api/moi/bilan/temps') return { status: 204 };
    if (url.startsWith('/api/moi/lectures') || url.startsWith('/api/moi/selections')) {
      return { body: { items: [], nextCursor: null } };
    }
    if (url === '/api/moi/notifications/non-lues') return { body: { unread: 0 } };
    return undefined;
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('bilan de lecture (#34)', () => {
  it('Mes lectures : quelques chiffres et le détail par mois ; accessible', async () => {
    withAccount();
    renderApp('/mes-lectures');
    const section = (await screen.findByRole('heading', { name: 'Mon bilan' })).closest('section')!;
    expect(
      (await within(section).findByText('Temps de lecture ce mois-ci')).nextSibling,
    ).toHaveTextContent('3 h 20 min');
    expect(within(section).getByText('Histoires terminées').nextSibling).toHaveTextContent('4');
    expect(within(section).getByText('Mots lus').nextSibling).toHaveTextContent('81 250');
    await userEvent.click(
      within(section).getByText('Temps de lecture des douze derniers mois', {
        selector: 'summary',
      }),
    );
    const table = within(section).getByRole('table', {
      name: 'Temps de lecture des douze derniers mois',
    });
    expect(within(table).getByRole('row', { name: 'octobre 2026 3 h 20 min' })).toBeInTheDocument();
    await expectAccessible();
  });

  it('désactivé : rien n’est demandé ni affiché', async () => {
    const calls = withAccount(false);
    renderApp('/mes-lectures');
    await screen.findByRole('heading', { level: 1, name: 'Mes lectures' });
    expect(screen.queryByRole('heading', { name: 'Mon bilan' })).toBeNull();
    expect(calls.some((c) => c.url.startsWith('/api/moi/bilan'))).toBe(false);
  });

  it('compte : le désactiver est enregistré aussitôt', async () => {
    const calls = withAccount();
    renderApp('/compte');
    const box = await screen.findByRole('checkbox', {
      name: 'Afficher mon bilan de lecture dans Mes lectures',
    });
    expect(box).toBeChecked();
    await userEvent.click(box);
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')).toMatchObject({
        url: '/api/moi/compte/bilan',
        body: { readingStats: false },
      }),
    );
    await waitFor(() => expect(box).not.toBeChecked());
  });

  it('lecteur : compte le temps actif, envoyé chaque minute ; rien après 2 minutes sans geste', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    signedIn();
    const calls = mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}`) {
        return {
          body: {
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
            wordCount: 4,
            chapterCount: 1,
            readCount: 0,
            publishedAt: '2026-10-03T10:00:00.000Z',
            updatedAt: '2026-10-03T10:00:00.000Z',
            chapters: [
              {
                id: CHAPTER,
                number: 1,
                title: 'Un',
                status: 'published',
                wordCount: 4,
                publishedAt: '2026-10-03T10:00:00.000Z',
              },
            ],
          },
        };
      }
      if (url === `/api/histoires/${STORY}/chapitres/${CHAPTER}`) {
        return {
          body: {
            id: CHAPTER,
            storyId: STORY,
            number: 1,
            title: 'Un',
            revisionId: CHAPTER,
            content: {
              type: 'doc',
              content: [
                {
                  type: 'paragraph',
                  attrs: { id: 'paragraphe-un' },
                  content: [{ type: 'text', text: 'Il était une fois.' }],
                },
              ],
            },
            wordCount: 4,
            readingMinutes: 1,
            publishedAt: '2026-10-03T10:00:00.000Z',
            previousId: null,
            nextId: null,
          },
        };
      }
      if (url === `/api/moi/lectures/${STORY}`) {
        return {
          body: {
            entry: {
              shelf: 'reading',
              chapterId: CHAPTER,
              blockId: null,
              updatedAt: '2026-10-17T10:00:00.000Z',
            },
          },
        };
      }
      if (url === '/api/moi/bilan/temps') return { status: 204 };
      if (init.method === 'PUT') return { body: { entry: null } };
      return undefined;
    });
    renderApp(`/histoires/${STORY}/chapitres/${CHAPTER}`);
    await screen.findByText('Il était une fois.');
    const sent = () =>
      calls
        .filter((c) => c.url === '/api/moi/bilan/temps')
        .map((c) => (c.body as { seconds: number }).seconds);

    // Une minute de lecture, avec un geste en cours de route.
    act(() => vi.advanceTimersByTime(30_000));
    fireEvent.scroll(window);
    act(() => vi.advanceTimersByTime(30_000));
    await waitFor(() => expect(sent()).toEqual([60]));

    // Plus de geste : on compte encore jusqu'à 2 minutes après le dernier, puis plus rien.
    act(() => vi.advanceTimersByTime(4 * 60_000));
    await waitFor(() => expect(sent()).toEqual([60, 60, 30]));
  });

  it('durées lisibles', () => {
    expect([0, 45, 60, 200].map(formatMinutes)).toEqual([
      'moins d’une minute',
      '45 min',
      '1 h',
      '3 h 20 min',
    ]);
  });
});
