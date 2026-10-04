import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectAccessible, mockApi, renderApp } from '../../test/render';

const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const CH1 = '01a102e1-bc70-7583-8a7d-c381bcb3647a';
const CH2 = '01a102e1-bc70-7583-8a7d-c381bcb3647b';

const summary = {
  id: STORY,
  title: 'La bibliothèque engloutie',
  summary: 'Quand la marée se retire…',
  author: { handle: 'Ilse.Varenne', displayName: 'Ilse Varenne' },
  language: 'fr',
  rating: 'general',
  status: 'published',
  completion: 'in_progress',
  majorWarnings: ['character_death'],
  tags: ['fantasy'],
  wordCount: 1200,
  chapterCount: 2,
  publishedAt: '2026-10-03T10:00:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
};
const chapter = (id: string, number: number) => ({
  id,
  number,
  title: number === 1 ? 'Ce que la mer rend' : 'Les registres mouillés',
  status: 'published',
  wordCount: 600,
  publishedAt: '2026-10-03T10:00:00.000Z',
});

function api() {
  return mockApi((url) => {
    if (url.startsWith('/api/histoires?')) return { body: { items: [summary], nextCursor: null } };
    if (url === `/api/histoires/${STORY}`) {
      return { body: { ...summary, chapters: [chapter(CH1, 1), chapter(CH2, 2)] } };
    }
    if (url === `/api/histoires/${STORY}/chapitres/${CH1}`) {
      return {
        body: {
          id: CH1,
          storyId: STORY,
          number: 1,
          title: 'Ce que la mer rend',
          revisionId: CH1,
          content: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'La ville basse.' }] },
              { type: 'horizontalRule' },
              { type: 'paragraph', content: [{ type: 'text', text: 'La porte de bronze.' }] },
            ],
          },
          wordCount: 6,
          readingMinutes: 1,
          publishedAt: '2026-10-03T10:00:00.000Z',
          previousId: null,
          nextId: CH2,
        },
      };
    }
  });
}

describe('lecture', () => {
  it('Explorer : les histoires publiées, avec classement et avertissements', async () => {
    api();
    renderApp('/');
    const list = await screen.findByRole('list', { name: 'Dernières histoires publiées' });
    expect(within(list).getByRole('link', { name: 'La bibliothèque engloutie' })).toHaveAttribute(
      'href',
      `/histoires/${STORY}`,
    );
    expect(within(list).getByText('Tout public')).toBeInTheDocument();
    expect(within(list).getByText(/mort d’un personnage/)).toBeInTheDocument();
    await expectAccessible();
  });

  it('fiche : sommaire et « Commencer la lecture »', async () => {
    api();
    renderApp(`/histoires/${STORY}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'La bibliothèque engloutie' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Commencer la lecture' })).toHaveAttribute(
      'href',
      `/histoires/${STORY}/chapitres/${CH1}`,
    );
    const toc = screen.getByRole('navigation', { name: 'Sommaire' });
    expect(within(toc).getAllByRole('link')).toHaveLength(2);
    await expectAccessible();
  });

  it('lecteur : texte, séparateur de scène annoncé, chapitre suivant', async () => {
    api();
    renderApp(`/histoires/${STORY}/chapitres/${CH1}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ce que la mer rend' }),
    ).toBeInTheDocument();
    expect(screen.getByText('La ville basse.')).toBeInTheDocument();
    expect(screen.getByRole('separator', { name: 'Changement de scène' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chapitre suivant →' })).toHaveAttribute(
      'href',
      `/histoires/${STORY}/chapitres/${CH2}`,
    );
    await expectAccessible();
  });

  it('histoire introuvable : message clair', async () => {
    mockApi(() => undefined);
    renderApp(`/histoires/${STORY}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Histoire introuvable' }),
    ).toBeInTheDocument();
  });
});
