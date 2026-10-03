import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, auth, expectAccessible, mockApi, renderApp, signedIn } from '../test/render';
import { safeReturnTo } from './auth';

describe('visite anonyme', () => {
  it('accueil : navigation, connexion et inscription proposées, page accessible', async () => {
    const { container } = renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Explorer' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('link', { name: 'Explorer' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toHaveAttribute(
      'href',
      '#contenu',
    );
    expect(document.title).toBe('Explorer — Plumiotheca');
    await expectAccessible(container);
  });

  it('« Créer un compte » ouvre directement l’inscription Keycloak, avec retour sur la page', async () => {
    renderApp('/charte');
    await userEvent.click(await screen.findByRole('button', { name: 'Créer un compte' }));
    expect(auth.signinRedirect).toHaveBeenCalledWith({
      state: { returnTo: '/charte' },
      prompt: 'create',
    });
  });

  it('une page réservée envoie à la connexion, puis y revient', async () => {
    renderApp('/ecrire');
    await waitFor(() =>
      expect(auth.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/ecrire' } }),
    );
    expect(screen.getByText('Redirection vers la connexion…')).toBeInTheDocument();
  });

  it('la charte se lit sans compte, avec ses articles', async () => {
    const { container } = renderApp('/charte');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Charte de la communauté' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Bienveillance/ })).toBeInTheDocument();
    await expectAccessible(container);
  });

  it('page inconnue : 404 lisible, avec l’en-tête', async () => {
    renderApp('/nulle-part');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page introuvable' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument();
  });

  it('page du système de design accessible', async () => {
    const { container } = renderApp('/design-system');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Système de design' }),
    ).toBeInTheDocument();
    await expectAccessible(container);
  });
});

describe('première visite', () => {
  it('une personne connectée sans pseudonyme est conduite à l’accueil', async () => {
    signedIn();
    mockApi((url) =>
      url === '/api/moi/compte'
        ? {
            body: account({
              step: 'first-visit',
              handle: null,
              ageBand: null,
              charterVersion: null,
            }),
          }
        : undefined,
    );
    renderApp('/ecrire');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bienvenue sur Plumiotheca' }),
    ).toBeInTheDocument();
  });

  it('erreurs en français, reliées aux champs, focus sur le premier champ en erreur', async () => {
    signedIn();
    mockApi((url) =>
      url === '/api/moi/compte'
        ? { body: account({ step: 'first-visit', handle: null }) }
        : undefined,
    );
    const { container } = renderApp('/bienvenue');
    await userEvent.click(await screen.findByRole('button', { name: 'Commencer' }));

    const handle = screen.getByRole('textbox', { name: /Votre pseudonyme/ });
    await waitFor(() => expect(handle).toHaveFocus());
    expect(handle).toHaveAttribute('aria-invalid', 'true');
    expect(handle).toHaveAccessibleDescription(/Trop petit|caractères/);
    expect(screen.getByText('Indiquez votre âge.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toHaveAccessibleDescription(
      'Acceptez la charte pour continuer.',
    );
    await expectAccessible(container);
  });

  it('envoi : pseudonyme, âge et version de la charte ; puis l’accueil', async () => {
    signedIn();
    let step = 'first-visit';
    const calls = mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account({ step }) };
      if (url.endsWith('/disponibilite')) return { body: { available: true } };
      if (url === '/api/moi/compte/premiere-visite' && init.method === 'POST') {
        step = 'ready';
        return { body: account({ handle: 'Élise' }) };
      }
    });
    renderApp('/bienvenue');
    const handle = await screen.findByRole('textbox', { name: /Votre pseudonyme/ });
    await userEvent.type(handle, ' Élise ');
    await userEvent.tab();
    expect(await screen.findByText('@Élise est disponible.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /18 ans ou plus/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /J’ai lu la charte/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Commencer' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Explorer' })).toBeInTheDocument();
    const sent = calls.find((c) => c.method === 'POST');
    expect(sent?.body).toEqual({ handle: 'Élise', age: '18+', charterVersion: '1' });
    expect(sent?.auth).toBe('Bearer jeton-de-test');
  });

  it('pseudonyme refusé par l’API : message sur le champ', async () => {
    signedIn();
    mockApi((url, init) => {
      if (url === '/api/moi/compte')
        return { body: account({ step: 'first-visit', handle: null }) };
      if (url.endsWith('/disponibilite')) return { body: { available: true } };
      if (init.method === 'POST') {
        return {
          status: 409,
          body: {
            type: 'nom-reserve',
            title: 'Conflit',
            status: 409,
            detail:
              'Ce nom pourrait faire croire à un message de l’équipe : choisissez-en un autre.',
          },
        };
      }
    });
    renderApp('/bienvenue');
    await userEvent.type(
      await screen.findByRole('textbox', { name: /Votre pseudonyme/ }),
      'Equipe',
    );
    await userEvent.click(screen.getByRole('radio', { name: /Entre 15 et 17 ans/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /J’ai lu la charte/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Commencer' }));
    const field = screen.getByRole('textbox', { name: /Votre pseudonyme/ });
    await waitFor(() => expect(field).toHaveAccessibleDescription(/message de l’équipe/));
    expect(field).toHaveFocus();
  });

  it('moins de 15 ans : page d’explication, sans autre accès', async () => {
    signedIn();
    mockApi((url) =>
      url === '/api/moi/compte' ? { body: account({ step: 'age-locked' }) } : undefined,
    );
    renderApp('/ecrire');
    expect(await screen.findByRole('heading', { level: 1, name: /À bientôt/ })).toBeInTheDocument();
  });

  it('nouvelle charte : relire et accepter', async () => {
    signedIn();
    let step = 'charter';
    const calls = mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account({ step }) };
      if (url === '/api/moi/compte/charte' && init.method === 'POST') {
        step = 'ready';
        return { body: account() };
      }
    });
    renderApp('/mes-lectures');
    await userEvent.click(await screen.findByRole('button', { name: 'J’accepte la charte' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Explorer' })).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ charterVersion: '1' });
  });
});

describe('compte connecté', () => {
  it('menu du compte : pseudonyme, thème et déconnexion', async () => {
    signedIn();
    mockApi((url) => (url === '/api/moi/compte' ? { body: account() } : undefined));
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Mon compte, @ilse' }));
    await userEvent.click(await screen.findByRole('menuitemradio', { name: /Sombre/ }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('plumiotheca.theme')).toBe('dark');
    await userEvent.click(await screen.findByRole('button', { name: 'Mon compte, @ilse' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Se déconnecter' }));
    expect(auth.signoutRedirect).toHaveBeenCalled();
  });

  it('jeton refusé : renouvellement silencieux puis connexion', async () => {
    signedIn();
    mockApi(() => ({
      status: 401,
      body: { type: 'non-authentifie', title: 'Non authentifié', status: 401 },
    }));
    renderApp('/mes-lectures');
    await waitFor(() => expect(auth.signinSilent).toHaveBeenCalled());
    await waitFor(() =>
      expect(auth.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/mes-lectures' } }),
    );
  });
});

describe('retour après connexion', () => {
  it.each([
    ['/histoires/1', '/histoires/1'],
    ['//exemple.org', '/'],
    ['https://exemple.org', '/'],
    [undefined, '/'],
  ])('%s → %s', (value, expected) => {
    expect(safeReturnTo(value)).toBe(expected);
  });
});
