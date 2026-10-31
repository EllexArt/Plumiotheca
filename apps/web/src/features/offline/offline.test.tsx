import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { account, expectAccessible, mockApi, renderApp, signedIn } from '../../test/render';
import { downloadedStories, saveStory } from './store';

const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const CH1 = '01a102e1-bc70-7583-8a7d-c381bcb3647a';
const CH2 = '01a102e1-bc70-7583-8a7d-c381bcb3647b';

const detail = {
  id: STORY,
  title: 'La bibliothèque engloutie',
  summary: 'Quand la marée se retire.',
  author: { handle: 'Ilse.Varenne', displayName: 'Ilse Varenne' },
  language: 'fr',
  rating: 'general',
  status: 'published',
  completion: 'in_progress',
  majorWarnings: [],
  contentWarnings: [],
  tags: [],
  wordCount: 8,
  chapterCount: 2,
  readCount: 0,
  publishedAt: '2026-10-03T10:00:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
  chapters: [CH1, CH2].map((id, i) => ({
    id,
    number: i + 1,
    title: i ? 'Deux' : 'Un',
    status: 'published',
    wordCount: 4,
    publishedAt: '2026-10-03T10:00:00.000Z',
  })),
};
const chapter = (id: string, i: number) => ({
  id,
  storyId: STORY,
  number: i + 1,
  title: i ? 'Deux' : 'Un',
  revisionId: id,
  content: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        attrs: { id: `paragraphe-${i}` },
        content: [{ type: 'text', text: `Texte du chapitre ${i + 1}.` }],
      },
    ],
  },
  wordCount: 4,
  readingMinutes: 1,
  publishedAt: '2026-10-03T10:00:00.000Z',
  previousId: i ? CH1 : null,
  nextId: i ? null : CH2,
});

/** Mode avion : aucune requête n'aboutit. */
const airplane = () =>
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));

describe('histoires téléchargées (#35)', () => {
  it('télécharger depuis la fiche : chaque chapitre publié, progression puis place prise', async () => {
    signedIn();
    const calls = mockApi((url) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}`) return { body: detail };
      if (url === `/api/histoires/${STORY}/chapitres/${CH1}`) return { body: chapter(CH1, 0) };
      if (url === `/api/histoires/${STORY}/chapitres/${CH2}`) return { body: chapter(CH2, 1) };
      if (url === `/api/moi/lectures/${STORY}`) return { body: { entry: null } };
      if (url.startsWith('/api/moi/')) return { body: { items: [], nextCursor: null, unread: 0 } };
      return undefined;
    });
    renderApp(`/histoires/${STORY}`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Télécharger pour lire hors ligne' }),
    );
    expect(
      await screen.findByText(/^Sur cet appareil depuis le .* \(\d+ ko\), lisible hors ligne\.$/),
    ).toBeInstanceOf(HTMLOutputElement);
    expect(calls.filter((c) => c.url.includes('/chapitres/')).map((c) => c.url)).toEqual([
      `/api/histoires/${STORY}/chapitres/${CH1}`,
      `/api/histoires/${STORY}/chapitres/${CH2}`,
    ]);
    expect(screen.getByRole('button', { name: 'Mettre à jour la copie' })).toBeInTheDocument();
    await expectAccessible();

    await userEvent.click(screen.getByRole('button', { name: 'Supprimer de l’appareil' }));
    expect(
      await screen.findByRole('button', { name: 'Télécharger pour lire hors ligne' }),
    ).toBeInTheDocument();
    expect(await downloadedStories()).toEqual([]);
  });

  it('un chapitre qui manque : rien n’est gardé, et c’est dit', async () => {
    signedIn();
    mockApi((url) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}`) return { body: detail };
      if (url === `/api/histoires/${STORY}/chapitres/${CH1}`) return { body: chapter(CH1, 0) };
      if (url === `/api/moi/lectures/${STORY}`) return { body: { entry: null } };
      if (url.startsWith('/api/moi/')) return { body: { items: [], nextCursor: null, unread: 0 } };
      return undefined;
    });
    renderApp(`/histoires/${STORY}`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Télécharger pour lire hors ligne' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'L’histoire n’a pas pu être téléchargée.',
    );
    expect(await downloadedStories()).toEqual([]);
  });

  it('sans compte : pas de bouton de téléchargement', async () => {
    mockApi((url) => (url === `/api/histoires/${STORY}` ? { body: detail } : undefined));
    renderApp(`/histoires/${STORY}`);
    await screen.findByRole('heading', { level: 1, name: 'La bibliothèque engloutie' });
    expect(screen.queryByRole('button', { name: /Télécharger/ })).toBeNull();
  });

  it('mode avion, déconnecté : la fiche et les chapitres téléchargés se lisent', async () => {
    await saveStory(detail as never, [chapter(CH1, 0), chapter(CH2, 1)] as never);
    airplane();
    renderApp(`/histoires/${STORY}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'La bibliothèque engloutie' }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/lisible hors ligne/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Commencer la lecture' }));
    expect(await screen.findByText('Texte du chapitre 1.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /Chapitre suivant/ }));
    expect(await screen.findByText('Texte du chapitre 2.')).toBeInTheDocument();
  });

  it('mode avion, histoire non téléchargée : l’erreur de réseau, comme avant', async () => {
    airplane();
    renderApp(`/histoires/${STORY}`);
    expect(await screen.findByRole('alert', {}, { timeout: 8000 })).toHaveTextContent(
      'Cette histoire n’a pas pu être chargée.',
    );
  }, 10_000);

  it('« Sur cet appareil » : liste, suppression, tout supprimer ; accessible', async () => {
    await saveStory(detail as never, [chapter(CH1, 0), chapter(CH2, 1)] as never);
    await saveStory({ ...detail, id: CH1, title: 'Le phare' } as never, [] as never);
    airplane();
    renderApp('/sur-cet-appareil');
    const list = await screen.findByRole('list', { name: 'Histoires téléchargées' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(/^2 histoires, \d+ ko en tout\.$/)).toBeInTheDocument();
    expect(
      within(list).getByRole('link', { name: 'Lire « La bibliothèque engloutie »' }),
    ).toHaveAttribute('href', `/histoires/${STORY}/chapitres/${CH1}`);
    await expectAccessible();

    await userEvent.click(
      within(list).getByRole('button', { name: 'Supprimer « Le phare » de l’appareil' }),
    );
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(1));
    await waitFor(() => expect(screen.getByText(/^1 histoire, \d+ ko en tout\.$/)).toHaveFocus());

    await userEvent.click(screen.getByRole('button', { name: 'Tout supprimer de l’appareil' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Tout supprimer' }),
    );
    expect(await screen.findByText(/Aucune histoire téléchargée/)).toBeInTheDocument();
    await waitFor(() => expect(document.getElementById('contenu')).toHaveFocus());
  });
});
