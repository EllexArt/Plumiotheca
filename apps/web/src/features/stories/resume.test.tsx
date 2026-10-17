import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { account, expectAccessible, mockApi, renderApp, signedIn } from '../../test/render';

const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const CH1 = '01a102e1-bc70-7583-8a7d-c381bcb3647a';
const CH2 = '01a102e1-bc70-7583-8a7d-c381bcb3647b';
const BLOCKS = ['paragraphe-un', 'paragraphe-deux', 'paragraphe-trois'];

const summary = {
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
  chapterCount: 2,
  readCount: 0,
  publishedAt: '2026-10-03T10:00:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
};
const detail = {
  ...summary,
  chapters: [CH1, CH2].map((id, i) => ({
    id,
    number: i + 1,
    title: i ? 'Deux' : 'Un',
    status: 'published',
    wordCount: 50,
    publishedAt: '2026-10-03T10:00:00.000Z',
  })),
};
const chapter = {
  id: CH2,
  storyId: STORY,
  number: 2,
  title: 'Deux',
  revisionId: CH2,
  content: {
    type: 'doc',
    content: BLOCKS.map((id, i) => ({
      type: 'paragraph',
      attrs: { id },
      content: [{ type: 'text', text: `Paragraphe ${i + 1}.` }],
    })),
  },
  wordCount: 6,
  readingMinutes: 1,
  publishedAt: '2026-10-03T10:00:00.000Z',
  previousId: CH1,
  nextId: null,
};

type Entry = { shelf: string; chapterId: string | null; blockId: string | null } | null;

/** API simulée, avec Mes lectures en mémoire (comme sur le compte). */
function api(start: Entry = null) {
  let entry: Entry = start;
  const status = () => ({
    body: { entry: entry && { ...entry, updatedAt: '2026-10-17T10:00:00.000Z' } },
  });
  const calls = mockApi((url, init) => {
    const method = init.method ?? 'GET';
    if (url === '/api/moi/compte') return { body: account() };
    if (url === `/api/histoires/${STORY}`) return { body: detail };
    if (url === `/api/histoires/${STORY}/chapitres/${CH2}`) return { body: chapter };
    if (url === `/api/moi/lectures/${STORY}/position`) {
      const body = JSON.parse(String(init.body)) as { chapterId: string; blockId: string | null };
      entry = {
        shelf: !entry || entry.shelf === 'to_read' ? 'reading' : entry.shelf,
        ...body,
      };
      return status();
    }
    if (url === `/api/moi/lectures/${STORY}`) {
      if (method === 'PUT') {
        const { shelf } = JSON.parse(String(init.body)) as { shelf: string };
        entry = { chapterId: null, blockId: null, ...entry, shelf };
      }
      if (method === 'DELETE') {
        entry = null;
        return { status: 204 };
      }
      return status();
    }
    if (url.startsWith('/api/moi/lectures?')) {
      const shelf = new URL(url, 'http://x').searchParams.get('etagere');
      const items =
        entry && entry.shelf === shelf
          ? [{ ...entry, updatedAt: '2026-10-17T10:00:00.000Z', story: summary }]
          : [];
      return { body: { items, nextCursor: null } };
    }
    return undefined;
  });
  return { calls, entry: () => entry };
}

beforeEach(() => {
  // jsdom ne fait pas défiler la page.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('Mes lectures et reprise au paragraphe (#29, #30)', () => {
  it('ouvrir un chapitre l’ajoute à Mes lectures ; la fiche propose alors « Reprendre »', async () => {
    signedIn();
    const server = api();
    const { router } = renderApp(`/histoires/${STORY}/chapitres/${CH2}`);
    await screen.findByText('Paragraphe 3.');
    await waitFor(() =>
      expect(server.entry()).toEqual({ shelf: 'reading', chapterId: CH2, blockId: null }),
    );
    await router.navigate(`/histoires/${STORY}`);
    expect(await screen.findByRole('link', { name: 'Reprendre au chapitre 2' })).toHaveAttribute(
      'href',
      `/histoires/${STORY}/chapitres/${CH2}`,
    );
  });

  it('« Reprendre » ramène au dernier paragraphe lu, focus dessus (autre appareil)', async () => {
    signedIn();
    api({ shelf: 'reading', chapterId: CH2, blockId: 'paragraphe-deux' });
    renderApp(`/histoires/${STORY}`);
    await userEvent.click(await screen.findByRole('link', { name: 'Reprendre au chapitre 2' }));
    const paragraph = (await screen.findByText('Paragraphe 2.')).closest('p')!;
    await waitFor(() => expect(paragraph).toHaveFocus());
    expect(paragraph.scrollIntoView).toHaveBeenCalled();
  });

  it('pendant la lecture : le paragraphe en cours est enregistré sur le compte', async () => {
    signedIn();
    const server = api({ shelf: 'reading', chapterId: CH2, blockId: null });
    renderApp(`/histoires/${STORY}/chapitres/${CH2}`);
    await screen.findByText('Paragraphe 3.');
    // Le premier paragraphe est passé sous l'en-tête, le deuxième est à l'écran.
    BLOCKS.forEach((id, i) => {
      const block = document.getElementById(`b-${id}`)!;
      block.getBoundingClientRect = () => ({ bottom: [40, 300, 600][i]! }) as DOMRect;
    });
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    await waitFor(() => expect(server.entry()?.blockId).toBe('paragraphe-deux'), {
      timeout: 5000,
    });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('sans compte : rien n’est envoyé ; un ancien historique de l’appareil est effacé', async () => {
    localStorage.setItem('plumiotheca.lectures', JSON.stringify([[STORY, CH2]]));
    const server = api();
    renderApp(`/histoires/${STORY}/chapitres/${CH2}`);
    await screen.findByText('Paragraphe 3.');
    expect(server.calls.some((c) => c.url.startsWith('/api/moi/lectures'))).toBe(false);
    expect(localStorage.getItem('plumiotheca.lectures')).toBeNull();
  });

  it('chapitre retenu mais dépublié (pas de reprise) : « Commencer la lecture »', async () => {
    signedIn();
    api({ shelf: 'reading', chapterId: null, blockId: null });
    renderApp(`/histoires/${STORY}`);
    expect(await screen.findByRole('link', { name: 'Commencer la lecture' })).toHaveAttribute(
      'href',
      `/histoires/${STORY}/chapitres/${CH1}`,
    );
  });

  it('fiche : ranger l’histoire ; elle apparaît sur l’étagère de Mes lectures ; pages accessibles', async () => {
    signedIn();
    api();
    const { router } = renderApp(`/histoires/${STORY}`);
    const select = await screen.findByRole('combobox', { name: 'Dans Mes lectures' });
    await userEvent.selectOptions(select, 'À lire');
    expect(await screen.findByText('Rangée : À lire.')).toBeInTheDocument();
    await expectAccessible();

    await router.navigate('/mes-lectures');
    const shelf = await screen.findByRole('list', { name: 'Mes lectures : À lire' });
    expect(
      within(shelf).getByRole('link', { name: 'La bibliothèque engloutie' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Les histoires que vous commencez apparaissent ici/),
    ).toBeInTheDocument();
    await expectAccessible();
  });
});
