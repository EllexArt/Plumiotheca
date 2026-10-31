import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { account, mockApi, renderApp, signedIn } from '../../test/render';
import { chunks, pendingFor } from './outbox';
import { saveStory } from './store';

const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const OTHER = '01a102e1-bc65-7d35-b6b2-50377a7804f8';
const CH1 = '01a102e1-bc70-7583-8a7d-c381bcb3647a';
const KEY = 'plumiotheca.envois';

const detail = {
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
      id: CH1,
      number: 1,
      title: 'Un',
      status: 'published',
      wordCount: 4,
      publishedAt: '2026-10-03T10:00:00.000Z',
    },
  ],
};
const chapter = {
  id: CH1,
  storyId: STORY,
  number: 1,
  title: 'Un',
  revisionId: CH1,
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
};

const seed = (outbox: unknown) => localStorage.setItem(KEY, JSON.stringify(outbox));

/** API joignable : positions et temps acceptés (ou bilan désactivé). */
function online(time: { status: number } = { status: 204 }) {
  return mockApi((url) => {
    if (url === '/api/moi/compte') return { body: account() };
    if (url.endsWith('/position')) return { body: { entry: null } };
    if (url === '/api/moi/bilan/temps') return time;
    if (url.startsWith('/api/moi/')) return { body: { items: [], nextCursor: null, unread: 0 } };
    return undefined;
  });
}

describe('lectures faites hors ligne (#35)', () => {
  it('mode avion, connecté : la position est gardée sur l’appareil, au nom du compte', async () => {
    await saveStory(detail as never, [chapter] as never);
    signedIn();
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    renderApp(`/histoires/${STORY}/chapitres/${CH1}`);
    expect(await screen.findByText('Il était une fois.')).toBeInTheDocument();
    await waitFor(
      () =>
        expect(pendingFor('compte-de-test')?.positions[STORY]).toMatchObject({
          chapterId: CH1,
          blockId: null,
          readAt: expect.any(String),
        }),
      { timeout: 8000 },
    );
  }, 10_000);

  it('retour du réseau : positions (datées) puis temps, par tranches d’une heure ; file vidée', async () => {
    const readAt = '2026-10-31T08:00:00.000Z';
    seed({
      account: 'compte-de-test',
      positions: { [STORY]: { chapterId: CH1, blockId: 'paragraphe-un', readAt } },
      seconds: 4000,
    });
    signedIn();
    const calls = online();
    renderApp('/');
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
    expect(calls.filter((c) => c.method !== 'GET').map((c) => [c.method, c.url, c.body])).toEqual([
      [
        'PUT',
        `/api/moi/lectures/${STORY}/position`,
        { chapterId: CH1, blockId: 'paragraphe-un', readAt },
      ],
      ['POST', '/api/moi/bilan/temps', { seconds: 3600 }],
      ['POST', '/api/moi/bilan/temps', { seconds: 400 }],
    ]);
  });

  it('bilan désactivé entre-temps : le temps est abandonné, pas réessayé', async () => {
    seed({ account: 'compte-de-test', positions: {}, seconds: 120 });
    signedIn();
    online({ status: 409 });
    renderApp('/');
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
  });

  it('toujours hors ligne : rien n’est perdu ; envoyé à l’événement « online »', async () => {
    seed({
      account: 'compte-de-test',
      positions: { [OTHER]: { chapterId: CH1, blockId: null, readAt: '2026-10-31T08:00:00.000Z' } },
      seconds: 0,
    });
    signedIn();
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const calls = online();
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Explorer' });
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(localStorage.getItem(KEY)).toBeNull());
    expect(calls.some((c) => c.method === 'PUT' && c.url.includes(OTHER))).toBe(true);
    onLine.mockRestore();
  });

  it('lectures d’un autre compte : jamais envoyées, laissées intactes', async () => {
    const theirs = { account: 'autre-compte', positions: {}, seconds: 300 };
    seed(theirs);
    signedIn();
    const calls = online();
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Explorer' });
    expect(calls.some((c) => c.url === '/api/moi/bilan/temps')).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(theirs);
  });

  it('connecté, réseau coupé : la page publique s’affiche, le compte n’est pas redemandé en boucle', async () => {
    signedIn();
    const urls: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url);
      return Promise.reject(new TypeError('Failed to fetch'));
    });
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Explorer' })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(urls.filter((url) => url.endsWith('/moi/compte'))).toHaveLength(1);
  });

  it('tranches d’une heure au plus', () => {
    expect(chunks(0)).toEqual([]);
    expect(chunks(59.9)).toEqual([59]);
    expect(chunks(7300)).toEqual([3600, 3600, 100]);
  });
});
