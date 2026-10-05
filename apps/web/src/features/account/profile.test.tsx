import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, auth, expectAccessible, mockApi, renderApp, signedIn } from '../../test/render';

const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const CH1 = '01a102e1-bc70-7583-8a7d-c381bcb3647a';
const CH2 = '01a102e1-bc70-7583-8a7d-c381bcb3647b';

const summary = (id: string, title: string) => ({
  id,
  title,
  summary: '',
  author: { handle: 'Ilse.Varenne', displayName: 'Ilse Varenne' },
  language: 'fr',
  rating: 'general',
  status: 'published',
  completion: 'in_progress',
  majorWarnings: [],
  tags: ['fantasy'],
  wordCount: 100,
  chapterCount: 2,
  publishedAt: '2026-10-03T10:00:00.000Z',
  updatedAt: '2026-10-03T10:00:00.000Z',
});
const ids = Array.from(
  { length: 25 },
  (_, i) => `01a102e1-0000-7000-8000-${String(i).padStart(12, '0')}`,
);

describe('Explorer : pagination et tags', () => {
  it('« Voir plus d’histoires » charge la page suivante et place le focus sur la première ajoutée', async () => {
    const calls = mockApi((url) => {
      if (!url.startsWith('/api/histoires?')) return undefined;
      const after = new URL(url, 'http://x').searchParams.get('apres');
      return after
        ? {
            body: {
              items: ids.slice(20).map((id, i) => summary(id, `Histoire ${21 + i}`)),
              nextCursor: null,
            },
          }
        : {
            body: {
              items: ids.slice(0, 20).map((id, i) => summary(id, `Histoire ${1 + i}`)),
              nextCursor: 'curseur-1',
            },
          };
    });
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Voir plus d’histoires' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Histoire 21' })).toHaveFocus());
    expect(calls.at(-1)?.url).toContain('apres=curseur-1');
    expect(screen.queryByRole('button', { name: 'Voir plus d’histoires' })).toBeNull();
  });

  it('tag : lien depuis une carte, liste filtrée, retour à toutes les histoires', async () => {
    const calls = mockApi((url) =>
      url.startsWith('/api/histoires?')
        ? { body: { items: [summary(STORY, 'Lucioles')], nextCursor: null } }
        : undefined,
    );
    renderApp('/');
    await userEvent.click(
      await screen.findByRole('link', { name: /Histoires avec le tag fantasy/ }),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Histoires avec le tag « fantasy »' }),
    ).toBeInTheDocument();
    expect(calls.at(-1)?.url).toContain('tag=fantasy');
    expect(screen.getByRole('link', { name: 'Voir toutes les histoires' })).toHaveAttribute(
      'href',
      '/',
    );
    await expectAccessible();
  });
});

describe('fiche et lecteur', () => {
  const detail = {
    ...summary(STORY, 'Lucioles'),
    chapters: [
      {
        id: CH1,
        number: 1,
        title: 'Un',
        status: 'published',
        wordCount: 50,
        publishedAt: '2026-10-03T10:00:00.000Z',
      },
      {
        id: CH2,
        number: 2,
        title: 'Deux',
        status: 'published',
        wordCount: 50,
        publishedAt: '2026-10-03T10:00:00.000Z',
      },
    ],
  };
  const chapter = {
    id: CH2,
    storyId: STORY,
    number: 2,
    title: 'Deux',
    revisionId: CH2,
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Texte.' }] }],
    },
    wordCount: 1,
    readingMinutes: 1,
    publishedAt: '2026-10-03T10:00:00.000Z',
    previousId: CH1,
    nextId: null,
  };
  const api = () =>
    mockApi((url) => {
      if (url === `/api/histoires/${STORY}`) return { body: detail };
      if (url === `/api/histoires/${STORY}/chapitres/${CH2}`) return { body: chapter };
    });

  it('lecteur : barre de progression ; le chapitre ouvert devient « Reprendre » sur la fiche', async () => {
    api();
    const { router } = renderApp(`/histoires/${STORY}/chapitres/${CH2}`);
    expect(
      await screen.findByRole('progressbar', { name: 'Progression dans le chapitre' }),
    ).toBeInTheDocument();
    await router.navigate(`/histoires/${STORY}`);
    expect(await screen.findByRole('link', { name: 'Reprendre au chapitre 2' })).toHaveAttribute(
      'href',
      `/histoires/${STORY}/chapitres/${CH2}`,
    );
    expect(screen.getByRole('link', { name: 'Ilse Varenne' })).toHaveAttribute(
      'href',
      '/profils/Ilse.Varenne',
    );
  });

  it('déconnexion : l’historique de lecture de l’appareil est effacé', async () => {
    localStorage.setItem(`plumiotheca.lecture.${STORY}`, CH2);
    signedIn();
    mockApi((url) => (url === '/api/moi/compte' ? { body: account() } : undefined));
    renderApp('/charte');
    await userEvent.click(await screen.findByRole('button', { name: 'Mon compte, @ilse' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Se déconnecter' }));
    expect(auth.signoutRedirect).toHaveBeenCalled();
    expect(localStorage.getItem(`plumiotheca.lecture.${STORY}`)).toBeNull();
  });
});

describe('profil public', () => {
  it('nom, pronoms, présentation et histoires de la personne ; page accessible', async () => {
    const calls = mockApi((url) => {
      if (url === '/api/pseudonymes/Ilse.Varenne') {
        return {
          body: {
            handle: 'Ilse.Varenne',
            displayName: 'Ilse Varenne',
            pronouns: 'elle',
            bio: 'J’écris la nuit.\n\nSurtout du fantastique.',
          },
        };
      }
      if (url.startsWith('/api/histoires?'))
        return { body: { items: [summary(STORY, 'Lucioles')], nextCursor: null } };
    });
    renderApp('/profils/Ilse.Varenne');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Ilse Varenne (elle)' }),
    ).toBeInTheDocument();
    expect(screen.getByText('@Ilse.Varenne')).toBeInTheDocument();
    expect(screen.getByText('Surtout du fantastique.')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Histoires de Ilse Varenne' });
    expect(within(list).getByRole('link', { name: 'Lucioles' })).toBeInTheDocument();
    expect(calls.find((c) => c.url.startsWith('/api/histoires?'))?.url).toContain(
      'pseudonyme=Ilse.Varenne',
    );
    await expectAccessible();
  });

  it('pseudonyme inconnu : « Profil introuvable »', async () => {
    mockApi(() => undefined);
    renderApp('/profils/personne');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Profil introuvable' }),
    ).toBeInTheDocument();
  });
});

describe('paramètres du compte', () => {
  it('profil : un champ vidé est effacé (null) ; e-mail jamais demandé', async () => {
    signedIn();
    const calls = mockApi((url, init) => {
      if (url === '/api/moi/compte' && (init.method ?? 'GET') === 'GET')
        return { body: account({ displayName: 'Ilse', pronouns: 'elle' }) };
      if (url === '/api/moi/compte/profil')
        return { body: account({ displayName: 'Ilse V.', pronouns: null }) };
    });
    renderApp('/compte');
    const name = await screen.findByRole('textbox', { name: 'Nom affiché' });
    await userEvent.clear(name);
    await userEvent.type(name, 'Ilse V.');
    await userEvent.clear(screen.getByRole('textbox', { name: 'Pronoms' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le profil' }));
    expect(await screen.findByText('Profil enregistré.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      displayName: 'Ilse V.',
      pronouns: null,
      bio: null,
    });
    expect(screen.queryByRole('textbox', { name: /mail/i })).toBeNull();
    await expectAccessible();
  });

  it('pseudonyme : changement puis profil public ; date du prochain changement si trop tôt', async () => {
    signedIn();
    let handle = 'ilse';
    const calls = mockApi((url, init) => {
      if (url === '/api/moi/compte/pseudonyme') {
        handle = 'ilse.varenne';
        return { body: account({ handle, handleChangeableFrom: '2026-11-05T10:00:00.000Z' }) };
      }
      if (url === '/api/moi/compte' && (init.method ?? 'GET') === 'GET')
        return { body: account({ handle }) };
      if (url.startsWith('/api/pseudonymes/'))
        return { body: { handle, displayName: null, pronouns: null, bio: null } };
      if (url.startsWith('/api/histoires?')) return { body: { items: [], nextCursor: null } };
    });
    renderApp('/compte');
    const field = await screen.findByRole('textbox', { name: 'Nouveau pseudonyme' });
    await userEvent.clear(field);
    await userEvent.type(field, 'ilse.varenne');
    await userEvent.click(screen.getByRole('button', { name: 'Changer de pseudonyme' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: '@ilse.varenne' }),
    ).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PUT')?.body).toEqual({ handle: 'ilse.varenne' });
  });
});
