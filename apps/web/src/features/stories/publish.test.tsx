import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, expectAccessible, mockApi, renderApp, signedIn } from '../../test/render';

const STORY = '01a102e1-bc65-7d35-b6b2-50377a7804f7';
const CH = '01a102e1-bc70-7583-8a7d-c381bcb3647a';

const chapter = (status: 'draft' | 'published') => ({
  id: CH,
  number: 1,
  title: 'Le premier toit',
  status,
  wordCount: 800,
  publishedAt: status === 'published' ? '2026-10-04T10:00:00.000Z' : null,
});

const detail = (overrides: Record<string, unknown> = {}) => ({
  id: STORY,
  title: 'Les jardins suspendus',
  summary: 'Des potagers sur les toits.',
  author: { handle: 'ilse', displayName: 'Ilse Varenne' },
  language: 'fr',
  rating: null,
  status: 'draft',
  completion: 'in_progress',
  majorWarnings: null,
  contentWarnings: [],
  tags: ['urbain'],
  wordCount: 0,
  chapterCount: 1,
  publishedAt: null,
  updatedAt: '2026-10-04T10:00:00.000Z',
  chapters: [chapter('published')],
  ...overrides,
});

const PAGE = `/ecrire/histoires/${STORY}/publier`;
const preview = () => screen.getByRole('complementary', { name: 'Aperçu dans Explorer' });

describe('avant de publier', () => {
  it('rien n’est choisi : la carte et la liste disent ce qui manque, le bouton est indisponible', async () => {
    signedIn();
    mockApi((url) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}`) return { body: detail() };
    });
    renderApp(PAGE);
    expect(await screen.findByRole('heading', { level: 1, name: 'Avant de publier' }));
    const button = screen.getByRole('button', { name: 'Publier l’histoire' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(
      'Il manque encore le classement, les avertissements majeurs.',
    );
    expect(within(preview()).getByText('Classement à choisir')).toBeInTheDocument();
    expect(within(preview()).getByText('Avertissements : à renseigner')).toBeInTheDocument();
    await expectAccessible();
  });

  it('la carte suit la saisie ; publier enregistre puis publie', async () => {
    signedIn();
    const calls = mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}` && init.method === 'PATCH')
        return { body: detail({ rating: 'teen', majorWarnings: [] }) };
      if (url === `/api/histoires/${STORY}/publication`)
        return { status: 201, body: detail({ status: 'published', rating: 'teen' }) };
      if (url === `/api/histoires/${STORY}`) return { body: detail() };
    });
    renderApp(PAGE);
    await userEvent.click(await screen.findByRole('radio', { name: /Ado/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Aucun avertissement majeur' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'deuil' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'addictions' }));
    expect(within(preview()).getByText('Ado')).toBeInTheDocument();
    expect(
      within(preview()).getByText('Autres avertissements : deuil, addictions'),
    ).toBeInTheDocument();
    expect(within(preview()).queryByText(/^Avertissements :/)).not.toBeInTheDocument();
    const tags = screen.getByRole('textbox', { name: /Tags/ });
    await userEvent.type(tags, ', Nuit, nuit');
    expect(within(preview()).getAllByText(/^nuit$/i)).toHaveLength(1);
    expect(screen.getByText('Tout est prêt.')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Publier l’histoire' });
    expect(button).not.toHaveAttribute('aria-disabled');
    // Double clic, sans rendu entre les deux : un seul envoi.
    fireEvent.click(button);
    fireEvent.click(button);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Votre histoire est publiée' }),
    ).toBeInTheDocument();
    // Le formulaire a disparu : le focus va au message de réussite.
    await waitFor(() =>
      expect(
        screen.getByText('« Les jardins suspendus » est en ligne.').closest('[tabindex="-1"]'),
      ).toHaveFocus(),
    );
    const order = calls
      .filter((c) => c.method !== 'GET')
      .map((c) => `${c.method} ${c.url.replace(`/api/histoires/${STORY}`, '')}`);
    expect(order).toEqual(['PATCH ', 'POST /publication']);
    // Seulement ce que la page montre : ni titre ni résumé (modifiés ailleurs, peut-être).
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      rating: 'teen',
      majorWarnings: [],
      contentWarnings: ['grief', 'addiction'],
      tags: ['urbain', 'Nuit', 'nuit'],
    });
    await expectAccessible();
  });

  it('avertissements cochés mais tag trop long : seule l’erreur du tag, focus sur Tags', async () => {
    signedIn();
    const calls = mockApi((url) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}`) return { body: detail({ rating: 'general' }) };
    });
    renderApp(PAGE);
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Aucun avertissement majeur' }),
    );
    const tags = screen.getByRole('textbox', { name: /Tags/ });
    await userEvent.type(tags, `, ${'a'.repeat(101)}`);
    expect(screen.getByText('Tout est prêt.')).toBeInTheDocument();
    expect(within(preview()).queryByText('Avertissements : à renseigner')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Publier l’histoire' }));
    await waitFor(() => expect(tags).toHaveFocus());
    expect(tags).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText(/Cochez les avertissements/)).toBeNull();
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('publier sans classement : erreur sur le classement', async () => {
    signedIn();
    mockApi((url) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}`) return { body: detail({ majorWarnings: [] }) };
    });
    renderApp(PAGE);
    await userEvent.click(await screen.findByRole('button', { name: 'Publier l’histoire' }));
    expect(await screen.findByText('Choisissez un classement pour publier.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('radio', { name: /Tout public/ })).toHaveFocus());
  });

  it('histoire déjà publiée : pas de formulaire, liens vers la fiche', async () => {
    signedIn();
    mockApi((url) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}`)
        return { body: detail({ status: 'published', rating: 'general', majorWarnings: [] }) };
    });
    renderApp(PAGE);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Histoire déjà publiée' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publier l’histoire' })).toBeNull();
  });

  it('histoire de quelqu’un d’autre : introuvable', async () => {
    signedIn();
    mockApi((url) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}`)
        return {
          body: detail({ status: 'published', author: { handle: 'tomas', displayName: null } }),
        };
    });
    renderApp(PAGE);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Histoire introuvable' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Vous pourrez modifier/)).toBeNull();
  });

  it('publier sans les avertissements : rien n’est envoyé, focus sur le champ en erreur', async () => {
    signedIn();
    const calls = mockApi((url) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}`) return { body: detail({ rating: 'general' }) };
    });
    renderApp(PAGE);
    await userEvent.click(await screen.findByRole('button', { name: 'Publier l’histoire' }));
    const none = screen.getByRole('checkbox', { name: 'Aucun avertissement majeur' });
    await waitFor(() => expect(none).toHaveFocus());
    expect(none).not.toBeChecked();
    expect(screen.getByText('L’histoire n’est pas encore publiable.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('aucun chapitre publié : la publication est impossible, avec un lien vers l’histoire', async () => {
    signedIn();
    const calls = mockApi((url) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}`)
        return {
          body: detail({ rating: 'general', majorWarnings: [], chapters: [chapter('draft')] }),
        };
    });
    renderApp(PAGE);
    expect(await screen.findByRole('link', { name: 'publier un chapitre' })).toHaveAttribute(
      'href',
      `/ecrire/histoires/${STORY}`,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Publier l’histoire' }));
    expect(
      await screen.findByText(/Il manque encore au moins un chapitre publié/, {
        selector: 'p:not([id])',
      }),
    ).toBeInTheDocument();
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });

  it('enregistrement en échec : message distinct, effacé à la saisie suivante', async () => {
    signedIn();
    mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}` && init.method === 'PATCH')
        return {
          status: 503,
          body: { type: 'indisponible', title: 'Service indisponible.', status: 503 },
        };
      if (url === `/api/histoires/${STORY}`)
        return { body: detail({ rating: 'general', majorWarnings: [] }) };
    });
    renderApp(PAGE);
    await userEvent.click(await screen.findByRole('button', { name: 'Publier l’histoire' }));
    expect(
      await screen.findByText('Les informations n’ont pas été enregistrées.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Informations enregistrées, mais/)).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'deuil' }));
    expect(screen.queryByText('Les informations n’ont pas été enregistrées.')).toBeNull();
  });

  it('refus de l’API : la raison est affichée', async () => {
    signedIn();
    mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}` && init.method === 'PATCH')
        return { body: detail({ rating: 'general', majorWarnings: [] }) };
      if (url === `/api/histoires/${STORY}/publication`)
        return {
          status: 409,
          body: {
            type: 'publication-incomplete',
            title: 'Avant de publier, il manque au moins un chapitre publié.',
            status: 409,
          },
        };
      if (url === `/api/histoires/${STORY}`)
        return { body: detail({ rating: 'general', majorWarnings: [] }) };
    });
    renderApp(PAGE);
    await userEvent.click(await screen.findByRole('button', { name: 'Publier l’histoire' }));
    expect(
      await screen.findByText('Avant de publier, il manque au moins un chapitre publié.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Informations enregistrées, mais l’histoire n’a pas pu être publiée.'),
    ).toBeInTheDocument();
  });

  it('depuis l’atelier, « Publier l’histoire » mène à cette page', async () => {
    signedIn();
    mockApi((url) => {
      if (url === '/api/moi/compte') return { body: account() };
      if (url === `/api/histoires/${STORY}`) return { body: detail() };
    });
    renderApp(`/ecrire/histoires/${STORY}`);
    await userEvent.click(await screen.findByRole('link', { name: 'Publier l’histoire' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Avant de publier' }),
    ).toBeInTheDocument();
  });
});
