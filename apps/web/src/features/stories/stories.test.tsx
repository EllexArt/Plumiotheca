import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, expectAccessible, mockApi, renderApp, signedIn } from '../../test/render';

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
  contentWarnings: ['grief', 'addiction'],
  tags: ['fantasy'],
  wordCount: 1200,
  chapterCount: 2,
  readCount: 37,
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

type Reply = { status?: number; body?: unknown } | undefined;

/** API simulée ; `extra` répond d'abord (compte, réglages…). */
function api(extra?: (url: string, init: RequestInit) => Reply) {
  return mockApi((url, init) => {
    const first = extra?.(url, init);
    if (first) return first;
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
    expect(within(list).getByText('Autres avertissements : deuil, addictions')).toBeInTheDocument();
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
    // Lectures uniques (#17).
    expect(screen.getByText('lectures').nextElementSibling).toHaveTextContent('37');
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

describe('recherche (#82)', () => {
  it('résultats de la recherche, nombre annoncé, requête dans l’adresse ; page accessible', async () => {
    const calls = mockApi((url) => {
      if (url.startsWith('/api/histoires?'))
        return { body: { items: [summary], nextCursor: null } };
      if (url.startsWith('/api/recherche?')) {
        return { body: { items: [summary], total: 1, nextPage: null } };
      }
    });
    renderApp('/');
    const field = await screen.findByRole('searchbox', { name: 'Rechercher une histoire' });
    await userEvent.type(field, 'bibliothèque engloutie');
    await userEvent.click(screen.getByRole('button', { name: 'Rechercher' }));
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Résultats pour « bibliothèque engloutie »',
      }),
    ).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Résultats de la recherche' });
    expect(
      within(list).getByRole('link', { name: 'La bibliothèque engloutie' }),
    ).toBeInTheDocument();
    // Zone annoncée (<output>, rôle « status »).
    expect(screen.getByText('1 résultat')).toBeInstanceOf(HTMLOutputElement);
    const params = new URL(calls.at(-1)!.url, 'http://x').searchParams;
    expect([params.get('q'), params.get('page')]).toEqual(['bibliothèque engloutie', '1']);
    await expectAccessible();
  });

  it('aucun résultat : message clair et annoncé', async () => {
    mockApi((url) => {
      if (url.startsWith('/api/recherche?'))
        return { body: { items: [], total: 0, nextPage: null } };
    });
    renderApp('/?q=rien');
    expect(await screen.findByText(/Aucune histoire ne correspond à « rien »/)).toBeInTheDocument();
    expect(screen.getByText('Aucun résultat.')).toBeInstanceOf(HTMLOutputElement);
  });

  it('recherche indisponible : alerte avec le message de l’API', async () => {
    mockApi((url) => {
      if (url.startsWith('/api/recherche?')) {
        return {
          status: 503,
          body: {
            type: 'indisponible',
            title: 'Service momentanément indisponible',
            status: 503,
            detail: 'La recherche est momentanément indisponible. Réessayez dans un instant.',
          },
        };
      }
    });
    renderApp('/?q=panne');
    expect(await screen.findByRole('alert')).toHaveTextContent(/momentanément indisponible/);
  });
});

describe('réglages de lecture (#28)', () => {
  // Le lecteur, même quand la fenêtre de réglages masque le reste aux aides techniques.
  const reader = () => document.querySelector<HTMLElement>('article[data-font]')!;

  it('sans compte : appliqués aussitôt, gardés sur l’appareil ; fenêtre accessible', async () => {
    api();
    const { unmount } = renderApp(`/histoires/${STORY}/chapitres/${CH1}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Réglages de lecture' }));
    const dialog = await screen.findByRole('dialog', { name: 'Réglages de lecture' });
    expect(dialog).toHaveTextContent('Gardés sur cet appareil');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Sans empattements/ }));
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Aéré' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Plus grand' }));
    expect(within(dialog).getByText('110 %')).toBeInTheDocument();
    expect(reader()).toHaveAttribute('data-font', 'sans');
    expect(reader()).toHaveAttribute('data-leading', 'aere');
    expect(reader().style.getPropertyValue('--reader-scale')).toBe('1.1');
    await expectAccessible();

    // Visite suivante sur le même appareil : mêmes réglages.
    unmount();
    renderApp(`/histoires/${STORY}/chapitres/${CH1}`);
    await screen.findByRole('heading', { level: 1, name: 'Ce que la mer rend' });
    expect(reader()).toHaveAttribute('data-font', 'sans');
  });

  it('taille : bornée, le bouton garde le focus à la limite', async () => {
    api();
    renderApp(`/histoires/${STORY}/chapitres/${CH1}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Réglages de lecture' }));
    const smaller = await screen.findByRole('button', { name: 'Plus petit' });
    await userEvent.click(smaller);
    await userEvent.click(smaller);
    await userEvent.click(smaller);
    expect(screen.getByText('80 %')).toBeInTheDocument();
    expect(smaller).toHaveAttribute('aria-disabled', 'true');
    expect(smaller).toHaveFocus();
  });

  it('avec un compte : ceux du compte, chaque changement enregistré ; retour aux réglages par défaut', async () => {
    signedIn();
    const saved = { font: 'sans', size: 130, lineHeight: 'serre', width: 'etroite' };
    const calls = api((url, init) => {
      if (url === '/api/moi/compte') return { body: account({ readingPreferences: saved }) };
      if (url === '/api/moi/compte/lecture') {
        const body = init.method === 'PUT' ? (JSON.parse(String(init.body)) as unknown) : null;
        return { body: account({ readingPreferences: body }) };
      }
      return undefined;
    });
    renderApp(`/histoires/${STORY}/chapitres/${CH1}`);
    await screen.findByRole('heading', { level: 1, name: 'Ce que la mer rend' });
    await waitFor(() => expect(reader()).toHaveAttribute('data-width', 'etroite'));
    expect(reader().style.getPropertyValue('--reader-scale')).toBe('1.3');

    await userEvent.click(screen.getByRole('button', { name: 'Réglages de lecture' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Gardés sur votre compte');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Large' }));
    expect(reader()).toHaveAttribute('data-width', 'large');
    await waitFor(() =>
      expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ ...saved, width: 'large' }),
    );

    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Revenir aux réglages par défaut' }),
    );
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
    expect(reader()).toHaveAttribute('data-font', 'lecture');
    expect(localStorage.getItem('plumiotheca.lecture')).toBeNull();
  });
});

describe('accessibilité du lecteur (#36)', () => {
  it('histoire en anglais : titre, résumé et texte annoncés en anglais (RGAA 8.7)', async () => {
    api((url) =>
      url === `/api/histoires/${STORY}`
        ? {
            body: {
              ...summary,
              language: 'en',
              chapters: [chapter(CH1, 1), chapter(CH2, 2)],
            },
          }
        : undefined,
    );
    renderApp(`/histoires/${STORY}/chapitres/${CH1}`);
    const text = await screen.findByText('La ville basse.');
    await waitFor(() => expect(text.closest('[lang]')).toHaveAttribute('lang', 'en'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveAttribute('lang', 'en');
    // L'interface autour garde la langue de la page (lang="fr" sur <html>, index.html).
    expect(screen.getByRole('navigation', { name: 'Chapitres' }).closest('[lang]')).toBeNull();
  });

  it('polices adaptées : très lisible ou adaptée à la dyslexie', async () => {
    api();
    renderApp(`/histoires/${STORY}/chapitres/${CH1}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Réglages de lecture' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Adaptée à la dyslexie/ }));
    expect(document.querySelector('article[data-font]')).toHaveAttribute('data-font', 'dyslexie');
    await userEvent.click(within(dialog).getByRole('radio', { name: /Très lisible/ }));
    expect(document.querySelector('article[data-font]')).toHaveAttribute('data-font', 'lisible');
    await expectAccessible();
  });
});
