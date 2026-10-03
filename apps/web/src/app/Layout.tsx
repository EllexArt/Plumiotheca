import { useQueryClient } from '@tanstack/react-query';
import { DropdownMenu } from 'radix-ui';
import { useEffect, useRef } from 'react';
import { useAuth } from 'react-oidc-context';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useMyAccount } from '../features/account/api';
import { Button, ButtonLink } from '../shared/ui/Button';
import { Alert } from '../shared/ui/Feedback';
import { AccountGate } from './AccountGate';
import type { SigninState } from './auth';
import styles from './Layout.module.css';
import { useTheme, type ThemeChoice } from './theme';

const Plume = () => (
  <svg
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    stroke="var(--color-accent)"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 3C12 4 6 9 5 18" />
    <path d="M20 3c0 7-5 12-12 13" />
    <path d="M5 18l-2 3" />
    <path d="M9.5 11.5l4-1" />
  </svg>
);

const navLinkClass = styles.navLink;

/** Connexion et inscription renvoient sur la page en cours. */
export function useSignin() {
  const auth = useAuth();
  const location = useLocation();
  const state: SigninState = { returnTo: location.pathname + location.search };
  return {
    signin: () => auth.signinRedirect({ state }),
    // prompt=create : Keycloak ouvre directement le formulaire d'inscription.
    register: () => auth.signinRedirect({ state, prompt: 'create' }),
  };
}

const themes: [ThemeChoice, string][] = [
  ['light', 'Clair'],
  ['dark', 'Sombre'],
  ['system', 'Comme l’appareil'],
];

function AccountMenu() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { data: account } = useMyAccount();
  const { choice, setChoice } = useTheme();
  const handle = account?.handle;
  const initials = (handle ?? '?').slice(0, 2).toUpperCase();

  const signout = () => {
    queryClient.clear();
    void auth.signoutRedirect();
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={styles.avatar}
        aria-label={handle ? `Mon compte, @${handle}` : 'Mon compte'}
      >
        <span aria-hidden="true">{initials}</span>
      </DropdownMenu.Trigger>
      {/* Pas de portail : le menu reste dans l'en-tête (repère « banner »), comme le bouton. */}
      <DropdownMenu.Content className={styles.menu} align="end" sideOffset={8}>
        {handle && <DropdownMenu.Label className={styles.menuLabel}>@{handle}</DropdownMenu.Label>}
        <DropdownMenu.Label className={styles.menuLabel}>Thème</DropdownMenu.Label>
        <DropdownMenu.RadioGroup value={choice} onValueChange={(v) => setChoice(v as ThemeChoice)}>
          {themes.map(([value, label]) => (
            <DropdownMenu.RadioItem key={value} value={value} className={styles.menuItem}>
              <span className={styles.menuIndicator} aria-hidden="true">
                <DropdownMenu.ItemIndicator>✓</DropdownMenu.ItemIndicator>
              </span>
              {label}
            </DropdownMenu.RadioItem>
          ))}
        </DropdownMenu.RadioGroup>
        <DropdownMenu.Separator className={styles.separator} />
        <DropdownMenu.Item className={styles.menuItem} onSelect={signout}>
          Se déconnecter
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

function Header() {
  const auth = useAuth();
  const { signin, register } = useSignin();
  return (
    <header className={styles.header}>
      <div className={styles.bar}>
        <Link to="/" className={styles.brand}>
          <Plume />
          Plumiotheca
        </Link>
        <nav className={styles.nav} aria-label="Navigation principale">
          <ul className={styles.navList}>
            <li>
              <NavLink to="/" end className={navLinkClass}>
                Explorer
              </NavLink>
            </li>
            <li>
              <NavLink to="/mes-lectures" className={navLinkClass}>
                Mes lectures
              </NavLink>
            </li>
          </ul>
        </nav>
        <div className={styles.actions}>
          <ButtonLink to="/ecrire" variant="primary">
            Écrire
          </ButtonLink>
          {auth.isAuthenticated ? (
            <AccountMenu />
          ) : (
            // Cachés seulement au tout premier chargement (lecture de la session) : pendant
            // le départ vers Keycloak, ils restent en place (le focus n'est pas perdu).
            (!auth.isLoading || auth.activeNavigator) && (
              <>
                <Button
                  variant="ghost"
                  pending={Boolean(auth.activeNavigator)}
                  onClick={() => void signin()}
                >
                  Se connecter
                </Button>
                <Button
                  variant="secondary"
                  pending={Boolean(auth.activeNavigator)}
                  onClick={() => void register()}
                >
                  Créer un compte
                </Button>
              </>
            )
          )}
        </div>
      </div>
    </header>
  );
}

/** Départs vers Keycloak dont l'échec doit être dit (sinon le clic ne fait rien, en silence). */
const NAVIGATORS = ['signinRedirect', 'signoutRedirect'];

/** Keycloak injoignable au moment de se connecter ou de se déconnecter : message annoncé. */
function SigninError() {
  const auth = useAuth();
  const source = (auth.error as { source?: string } | undefined)?.source;
  if (!source || !NAVIGATORS.includes(source)) return null;
  return (
    <div className={styles.banner}>
      <Alert tone="warning" live title="Le service de connexion ne répond pas.">
        <p>Réessayez dans un instant.</p>
      </Alert>
    </div>
  );
}

/**
 * Cadre commun. À chaque changement de page, le focus va au contenu principal : le
 * lecteur d'écran annonce la nouvelle page au lieu de rester sur le lien cliqué.
 */
export function Layout() {
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus();
  }, [location.pathname]);

  return (
    <>
      <a href="#contenu" className={styles.skip}>
        Aller au contenu
      </a>
      <Header />
      <main id="contenu" ref={main} tabIndex={-1} className={styles.main}>
        <SigninError />
        <AccountGate>
          <Outlet />
        </AccountGate>
      </main>
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <span>Plumiotheca, en construction.</span>
          <ul className={styles.footerLinks}>
            <li>
              <Link to="/charte">Charte de la communauté</Link>
            </li>
            <li>
              <Link to="/design-system">Système de design</Link>
            </li>
          </ul>
        </div>
      </footer>
    </>
  );
}
