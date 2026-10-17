import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { account, mockApi, renderApp, signedIn } from '../../test/render';
import { lastBlock, lastChapter, rememberBlock, rememberChapter } from './progress';

const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const CH1 = '01a102e1-bc70-7583-8a7d-c381bcb3647a';
const CH2 = '01a102e1-bc70-7583-8a7d-c381bcb3647b';
const BLOCKS = ['paragraphe-un', 'paragraphe-deux', 'paragraphe-trois'];

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
  wordCount: 100,
  chapterCount: 2,
  readCount: 0,
  publishedAt: '2026-10-03T10:00:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
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

function api() {
  mockApi((url) => {
    if (url === '/api/moi/compte') return { body: account() };
    if (url === `/api/histoires/${STORY}`) return { body: detail };
    if (url === `/api/histoires/${STORY}/chapitres/${CH2}`) return { body: chapter };
    return undefined;
  });
}

beforeEach(() => {
  // jsdom ne fait pas défiler la page.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('reprise au paragraphe près (#29)', () => {
  it('position retenue : chapitre et paragraphe ; rouvrir le même chapitre garde le paragraphe', () => {
    rememberBlock(STORY, CH2, 'paragraphe-deux');
    rememberChapter(STORY, CH2);
    expect([lastChapter(STORY), lastBlock(STORY)]).toEqual([CH2, 'paragraphe-deux']);
    // Autre chapitre : le paragraphe d'avant ne vaut plus.
    rememberChapter(STORY, CH1);
    expect([lastChapter(STORY), lastBlock(STORY)]).toEqual([CH1, null]);
  });

  it('« Reprendre » ramène au dernier paragraphe lu, focus dessus', async () => {
    rememberBlock(STORY, CH2, 'paragraphe-deux');
    signedIn();
    api();
    renderApp(`/histoires/${STORY}`);
    await userEvent.click(await screen.findByRole('link', { name: 'Reprendre au chapitre 2' }));
    const paragraph = (await screen.findByText('Paragraphe 2.')).closest('p')!;
    await waitFor(() => expect(paragraph).toHaveFocus());
    expect(paragraph.scrollIntoView).toHaveBeenCalled();
  });

  it('pendant la lecture : le paragraphe en cours est retenu', async () => {
    signedIn();
    api();
    renderApp(`/histoires/${STORY}/chapitres/${CH2}`);
    await screen.findByText('Paragraphe 3.');
    // Le premier paragraphe est passé sous l'en-tête, le deuxième est à l'écran.
    BLOCKS.forEach((id, i) => {
      const block = document.getElementById(`b-${id}`)!;
      block.getBoundingClientRect = () => ({ bottom: [40, 300, 600][i]! }) as DOMRect;
    });
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    await waitFor(() => expect(lastBlock(STORY)).toBe('paragraphe-deux'), { timeout: 2000 });
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('sans compte : rien n’est retenu (décision 54)', async () => {
    api();
    renderApp(`/histoires/${STORY}/chapitres/${CH2}`);
    await screen.findByText('Paragraphe 3.');
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, 700));
    expect(lastBlock(STORY)).toBeNull();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });
});
