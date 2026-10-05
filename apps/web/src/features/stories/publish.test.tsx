import { screen, waitFor, within } from '@testing-library/react';
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
    expect(within(preview()).getByText('Aussi : deuil, addictions')).toBeInTheDocument();
    expect(within(preview()).queryByText(/Avertissements :/)).not.toBeInTheDocument();
    expect(screen.getByText('Tout est prêt.')).toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Publier l’histoire' });
    expect(button).not.toHaveAttribute('aria-disabled');
    await userEvent.click(button);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Votre histoire est publiée' }),
    ).toBeInTheDocument();
    const order = calls
      .filter((c) => c.method !== 'GET')
      .map((c) => `${c.method} ${c.url.replace(`/api/histoires/${STORY}`, '')}`);
    expect(order).toEqual(['PATCH ', 'POST /publication']);
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
      rating: 'teen',
      majorWarnings: [],
      contentWarnings: ['grief', 'addiction'],
      tags: ['urbain'],
    });
    await expectAccessible();
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
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Je préfère ne pas préciser' })).toHaveFocus(),
    );
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
    expect(screen.getByText('L’histoire n’a pas pu être publiée.')).toBeInTheDocument();
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
