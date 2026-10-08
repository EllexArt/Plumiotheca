import { Handle } from '@plumiotheca/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renewOnce } from '../shared/api/useApi';
import { account, auth, expectAccessible, mockApi, renderApp, signedIn } from '../test/render';
import { safeReturnTo } from './auth';

const firstVisit = account({
  step: 'first-visit',
  handle: null,
  ageBand: null,
  charterVersion: null,
});
const problem = (status: number, type: string, detail?: string) => ({
  status,
  body: { type, title: 'Refus', status, ...(detail ? { detail } : {}) },
});

/** Remplit l'accueil : âge, pseudonyme, charte, puis envoi. */
async function fillFirstVisit(age: RegExp, handle: string) {
  await userEvent.click(await screen.findByRole('radio', { name: age }));
  await userEvent.type(screen.getByRole('textbox', { name: /Votre pseudonyme/ }), handle);
  await userEvent.click(screen.getByRole('checkbox', { name: /J’ai lu la charte/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Commencer' }));
}

describe('visite anonyme', () => {
  it('accueil : navigation, connexion et inscription proposées, page accessible', async () => {
    renderApp('/');
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
    await expectAccessible();
  });

  it('« Créer un compte » ouvre directement l’inscription Keycloak, avec retour sur la page', async () => {
    renderApp('/charte');
    await userEvent.click(await screen.findByRole('button', { name: 'Créer un compte' }));
    expect(auth.signinRedirect).toHaveBeenCalledWith({
      state: { returnTo: '/charte' },
      prompt: 'create',
    });
  });

  it('départ vers Keycloak : les boutons restent (focus gardé), marqués indisponibles', async () => {
    auth.isLoading = true;
    auth.activeNavigator = 'signinRedirect';
    renderApp('/');
    const button = await screen.findByRole('button', { name: 'Se connecter' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(button);
    expect(auth.signinRedirect).not.toHaveBeenCalled();
  });

  it('Keycloak injoignable : message annoncé', async () => {
    auth.error = Object.assign(new Error('Failed to fetch'), { source: 'signinRedirect' });
    renderApp('/');
    const message = await screen.findByText('Le service de connexion ne répond pas.');
    expect(message.closest('[role="status"]')).not.toBeNull();
  });

  it('une page réservée envoie à la connexion, puis y revient', async () => {
    renderApp('/ecrire');
    await waitFor(() =>
      expect(auth.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/ecrire' } }),
    );
    expect(screen.getByText('Redirection vers la connexion…')).toBeInTheDocument();
  });

  it('la charte se lit sans compte, avec ses articles', async () => {
    renderApp('/charte');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Charte de la communauté' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Bienveillance/ })).toBeInTheDocument();
    await expectAccessible();
  });

  it('page inconnue : 404 lisible, avec l’en-tête', async () => {
    renderApp('/nulle-part');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Page introuvable' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navigation principale' })).toBeInTheDocument();
  });

  it('système de design accessible, dialogue ouvert compris', async () => {
    renderApp('/design-system');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Système de design' }),
    ).toBeInTheDocument();
    await expectAccessible();
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir un dialogue' }));
    expect(
      await screen.findByRole('dialog', { name: 'Publier le chapitre ?' }),
    ).toBeInTheDocument();
    await expectAccessible();
  });
});

describe('première visite', () => {
  it('une personne connectée sans pseudonyme est conduite à l’accueil, qui demande l’âge d’abord', async () => {
    signedIn();
    mockApi((url) => (url === '/api/moi/compte' ? { body: firstVisit } : undefined));
    renderApp('/ecrire');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Bienvenue sur Plumiotheca' }),
    ).toBeInTheDocument();
    // Premier champ du formulaire : l'âge.
    const form = screen.getByRole('button', { name: 'Commencer' }).closest('form')!;
    expect(within(form).getAllByRole('group')[0]).toHaveAccessibleName(/Quel âge avez-vous/);
    expect(form.querySelector('input')).toHaveAttribute('type', 'radio');
  });

  it('erreurs en français, reliées aux champs, focus sur le premier champ en erreur', async () => {
    signedIn();
    mockApi((url) => (url === '/api/moi/compte' ? { body: firstVisit } : undefined));
    renderApp('/bienvenue');
    await userEvent.click(await screen.findByRole('button', { name: 'Commencer' }));

    const [firstRadio] = screen.getAllByRole('radio');
    await waitFor(() => expect(firstRadio).toHaveFocus());
    for (const radio of screen.getAllByRole('radio')) {
      expect(radio).toHaveAccessibleDescription(/Indiquez votre âge\./);
    }
    const handle = screen.getByRole('textbox', { name: /Votre pseudonyme/ });
    const tooShort = Handle.safeParse('').error!.issues[0]!.message;
    expect(handle).toHaveAttribute('aria-invalid', 'true');
    expect(handle).toHaveAccessibleDescription(expect.stringContaining(tooShort));
    expect(screen.getByRole('checkbox')).toHaveAccessibleDescription(
      'Acceptez la charte pour continuer.',
    );
    await expectAccessible();
  });

  it('envoi : âge, pseudonyme et version de la charte ; puis l’accueil du site', async () => {
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
    await userEvent.click(await screen.findByRole('radio', { name: /18 ans ou plus/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Votre pseudonyme/ }), ' Élise ');
    await userEvent.tab();
    expect(await screen.findByText('@Élise est disponible.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /J’ai lu la charte/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Commencer' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Explorer' })).toBeInTheDocument();
    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toEqual({ handle: 'Élise', age: '18+', charterVersion: '1' });
    expect(posts[0]?.auth).toBe('Bearer jeton-de-test');
  });

  it('pseudonyme pris à la sortie du champ : message annoncé, effacé à la saisie suivante', async () => {
    signedIn();
    mockApi((url) => {
      if (url === '/api/moi/compte') return { body: firstVisit };
      if (url.endsWith('/disponibilite')) return { body: { available: url.includes('elise2') } };
    });
    renderApp('/bienvenue');
    // La disponibilité n'est vérifiée qu'une fois l'âge choisi (15 ans ou plus).
    await userEvent.click(await screen.findByRole('radio', { name: /18 ans ou plus/ }));
    const field = screen.getByRole('textbox', { name: /Votre pseudonyme/ });
    await userEvent.type(field, 'elise');
    await userEvent.tab();
    const message = await screen.findByText('Ce pseudonyme est déjà pris. Essayez une variante.');
    expect(message.closest('[aria-live]')).not.toBeNull();
    await userEvent.type(field, '2');
    expect(screen.queryByText('Ce pseudonyme est déjà pris. Essayez une variante.')).toBeNull();
  });

  it('pseudonyme refusé à l’envoi : message de l’API sur le champ, focus dessus', async () => {
    signedIn();
    mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: firstVisit };
      if (url.endsWith('/disponibilite')) return { body: { available: true } };
      if (init.method === 'POST') {
        return problem(
          409,
          'pseudonyme-indisponible',
          'Ce pseudonyme n’est pas disponible. Essayez une variante.',
        );
      }
    });
    renderApp('/bienvenue');
    await fillFirstVisit(/Entre 15 et 17 ans/, 'Elise');
    const field = screen.getByRole('textbox', { name: /Votre pseudonyme/ });
    await waitFor(() =>
      expect(field).toHaveAccessibleDescription(/Ce pseudonyme n’est pas disponible/),
    );
    expect(field).toHaveFocus();
  });

  it('moins de 15 ans : ni pseudonyme ni charte, seule la réponse est envoyée ; page d’explication', async () => {
    signedIn();
    let step = 'first-visit';
    const calls = mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account({ step }) };
      if (url.endsWith('/disponibilite')) return { body: { available: true } };
      if (init.method === 'POST') {
        step = 'age-locked';
        return problem(403, 'age-minimum', 'Reviens quand tu auras 15 ans.');
      }
    });
    renderApp('/bienvenue');
    // Un pseudonyme tapé avant de choisir l'âge n'est pas envoyé.
    await userEvent.type(await screen.findByRole('textbox', { name: /Votre pseudonyme/ }), 'petit');
    await userEvent.click(screen.getByRole('radio', { name: /Moins de 15 ans/ }));
    expect(screen.queryByRole('textbox', { name: /Votre pseudonyme/ })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /J’ai lu la charte/ })).toBeNull();
    // Le changement du formulaire est annoncé (zone d'état toujours présente).
    expect(screen.getByRole('status')).toHaveTextContent(/nous ne gardons que votre réponse/);
    await expectAccessible();

    // Réponse définitive : sans confirmation, rien n'est envoyé.
    const send = screen.getByRole('button', { name: 'Envoyer ma réponse' });
    await userEvent.click(send);
    const confirm = screen.getByRole('checkbox', { name: /Je confirme avoir moins de 15 ans/ });
    await waitFor(() => expect(confirm).toHaveFocus());
    expect(confirm).toHaveAccessibleDescription(/Cochez la case pour confirmer/);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);

    await userEvent.click(confirm);
    await userEvent.click(send);
    expect(await screen.findByRole('heading', { level: 1, name: /À bientôt/ })).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ age: 'under-15' });
    expect(calls.some((c) => c.url.endsWith('/disponibilite'))).toBe(false);
    // Le message de l'API (autre registre) n'est pas affiché tel quel.
    expect(screen.queryByText(/Reviens quand tu auras/)).toBeNull();
  });

  it('âge corrigé en « moins de 15 ans » après la vérification du pseudonyme : seule la réponse part', async () => {
    signedIn();
    let release!: () => void;
    const late = new Promise<void>((r) => (release = r));
    const calls = mockApi(async (url, init) => {
      if (url === '/api/moi/compte') return { body: firstVisit };
      // Réponse de disponibilité qui arrive après le changement d'âge.
      if (url.endsWith('/disponibilite')) {
        await late;
        return { body: { available: true } };
      }
      if (init.method === 'POST') return problem(403, 'age-minimum', 'Refusé.');
    });
    renderApp('/bienvenue');
    await userEvent.click(await screen.findByRole('radio', { name: /18 ans ou plus/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Votre pseudonyme/ }), 'presque');
    await userEvent.click(screen.getByRole('radio', { name: /Moins de 15 ans/ }));
    release();
    await userEvent.click(
      screen.getByRole('checkbox', { name: /Je confirme avoir moins de 15 ans/ }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer ma réponse' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ age: 'under-15' });
    expect(screen.queryByText(/@presque est disponible/)).toBeNull();
  });

  it('compte verrouillé : aucune autre page', async () => {
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

  it('accueil déjà fait : les pages d’accueil renvoient au site', async () => {
    signedIn();
    mockApi((url) => (url === '/api/moi/compte' ? { body: account() } : undefined));
    renderApp('/bienvenue');
    expect(await screen.findByRole('heading', { level: 1, name: 'Explorer' })).toBeInTheDocument();
  });
});

describe('compte connecté', () => {
  it('menu du compte : pseudonyme, thème, déconnexion ; menu ouvert accessible', async () => {
    signedIn();
    mockApi((url) => (url === '/api/moi/compte' ? { body: account() } : undefined));
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Mon compte, @ilse' }));
    await screen.findByRole('menu');
    await expectAccessible();
    await userEvent.click(screen.getByRole('menuitemradio', { name: /Sombre/ }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('plumiotheca.theme')).toBe('dark');
    await userEvent.click(await screen.findByRole('button', { name: 'Mon compte, @ilse' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Se déconnecter' }));
    expect(auth.signoutRedirect).toHaveBeenCalled();
  });

  it('jeton expiré : renouvelé en silence, la requête repart avec le nouveau jeton', async () => {
    signedIn();
    auth.signinSilent.mockResolvedValueOnce({ access_token: 'nouveau' });
    const calls = mockApi((url, init) => {
      const header = (init.headers as Record<string, string>).Authorization;
      if (header !== 'Bearer nouveau') return problem(401, 'non-authentifie');
      if (url === '/api/moi/compte') return { body: account() };
    });
    renderApp('/mes-lectures');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mes lectures' }),
    ).toBeInTheDocument();
    expect(auth.signinRedirect).not.toHaveBeenCalled();
    expect(calls.map((c) => c.auth)).toEqual(['Bearer jeton-de-test', 'Bearer nouveau']);
  });

  it('jeton refusé et renouvellement impossible : connexion, retour sur la page', async () => {
    signedIn();
    mockApi(() => problem(401, 'non-authentifie'));
    renderApp('/mes-lectures');
    await waitFor(() => expect(auth.signinSilent).toHaveBeenCalled());
    await waitFor(() =>
      expect(auth.signinRedirect).toHaveBeenCalledWith({ state: { returnTo: '/mes-lectures' } }),
    );
  });

  it('API indisponible : message annoncé et « Réessayer » ; les pages publiques restent lisibles', async () => {
    signedIn();
    let up = false;
    mockApi((url) => {
      if (url !== '/api/moi/compte') return undefined;
      return up ? { body: account() } : problem(503, 'indisponible', 'Service indisponible.');
    });
    renderApp('/mes-lectures');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Votre compte n’a pas pu être chargé.',
    );
    up = true;
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mes lectures' }),
    ).toBeInTheDocument();
  });

  it('API indisponible sur une page publique : la page reste affichée', async () => {
    signedIn();
    mockApi(() => problem(503, 'indisponible'));
    renderApp('/charte');
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Charte de la communauté' }),
    ).toBeInTheDocument();
  });

  it('réponse hors contrat : message lisible, pas de détail technique', async () => {
    signedIn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockApi((url) =>
      url === '/api/moi/compte' ? { body: { ...account(), inattendu: 1 } } : undefined,
    );
    renderApp('/mes-lectures');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Plumiotheca a répondu de façon inattendue.');
    expect(alert).not.toHaveTextContent('unrecognized');
  });
});

describe('renouvellement partagé', () => {
  it('deux refus simultanés : un seul renouvellement', async () => {
    let resolve!: (user: { access_token: string }) => void;
    const renew = vi.fn(() => new Promise<{ access_token: string }>((r) => (resolve = r)));
    const first = renewOnce(renew);
    const second = renewOnce(renew);
    resolve({ access_token: 'nouveau' });
    expect(await first).toBe('nouveau');
    expect(await second).toBe('nouveau');
    expect(renew).toHaveBeenCalledTimes(1);
  });
});

describe('retour après connexion', () => {
  it.each([
    ['/histoires/1?chapitre=2', '/histoires/1?chapitre=2'],
    ['//exemple.org', '/'],
    ['/\\exemple.org', '/'],
    ['https://exemple.org', '/'],
    ['javascript:alert(1)', '/'],
    [undefined, '/'],
  ])('%s → %s', (value, expected) => {
    expect(safeReturnTo(value)).toBe(expected);
  });
});

describe('refus et incidents à la première visite', () => {
  it('accueil déjà fait dans un autre onglet (409 deja-fait) : le site s’ouvre', async () => {
    signedIn();
    let step = 'first-visit';
    mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: account({ step }) };
      if (url.endsWith('/disponibilite')) return { body: { available: true } };
      if (init.method === 'POST') {
        step = 'ready';
        return problem(409, 'deja-fait', 'La première visite est déjà faite.');
      }
    });
    renderApp('/bienvenue');
    await fillFirstVisit(/18 ans ou plus/, 'Elise');
    expect(await screen.findByRole('heading', { level: 1, name: 'Explorer' })).toBeInTheDocument();
  });

  it('charte mise à jour pendant la saisie : rechargement demandé', async () => {
    signedIn();
    mockApi((url, init) => {
      if (url === '/api/moi/compte') return { body: firstVisit };
      if (url.endsWith('/disponibilite')) return { body: { available: true } };
      if (init.method === 'POST')
        return problem(409, 'charte-perimee', 'Relisez la nouvelle version.');
    });
    renderApp('/bienvenue');
    await fillFirstVisit(/18 ans ou plus/, 'Elise');
    expect(await screen.findByRole('alert')).toHaveTextContent('Rechargez la page');
  });

  it('API qui redémarre (502 du relais) : message « ne répond pas »', async () => {
    signedIn();
    mockApi(() => ({ status: 502, body: '' }));
    renderApp('/mes-lectures');
    expect(await screen.findByRole('alert')).toHaveTextContent('Plumiotheca ne répond pas.');
  });
});
