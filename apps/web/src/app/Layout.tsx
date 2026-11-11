import { useQueryClient } from '@tanstack/react-query';
import { DropdownMenu } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useMyAccount } from '../features/account/api';
import { clearBackups, hasUnsavedText } from '../features/editor/backup';
import { forgetReadings } from '../features/stories/progress';
import { Button, ButtonLink } from '../shared/ui/Button';
import { Dialog } from '../shared/ui/Dialog';
import { Alert } from '../shared/ui/Feedback';
import { AccountGate } from './AccountGate';
import type { SigninState } from './auth';
import styles from './Layout.module.css';
import { AppearanceSync, useAppearance } from './appearance';
import type { ThemeChoice } from './theme';
import { useUnreadNotifications } from '../features/notifications/api';
import { AppStatus } from './AppStatus';
import { forgetOutbox } from '../features/offline/outbox';
import { OutboxSync } from '../features/offline/OutboxSync';

// Le logo garde l'identité Lueur, quelle que soit l'ambiance choisie (#77).
const Plume = () => (
  <svg
    data-ambiance="lueur"
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
  const appearance = useAppearance();
  const handle = account?.handle;
  const initials = (handle ?? '?').slice(0, 2).toUpperCase();

  const trigger = useRef<HTMLButtonElement>(null);
  // Texte non enregistré dans l'onglet : la déconnexion l'effacerait, on demande d'abord (#147).
  const [confirming, setConfirming] = useState(false);

  const signout = () => {
    queryClient.clear();
    clearBackups();
    forgetReadings();
    // Lectures hors ligne pas encore envoyées (#35) : rien ne reste au nom du compte.
    forgetOutbox();
    void auth.signoutRedirect();
  };

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          ref={trigger}
          className={styles.avatar}
          aria-label={handle ? `Mon compte, @${handle}` : 'Mon compte'}
        >
          <span aria-hidden="true">{initials}</span>
        </DropdownMenu.Trigger>
        {/* Pas de portail : le menu reste dans l'en-tête (repère « banner »), comme le bouton. */}
        <DropdownMenu.Content className={styles.menu} align="end" sideOffset={8}>
          {handle && (
            <DropdownMenu.Label className={styles.menuLabel}>@{handle}</DropdownMenu.Label>
          )}
          {handle && (
            <DropdownMenu.Item asChild className={styles.menuItem}>
              <Link to={`/profils/${encodeURIComponent(handle)}`}>Mon profil</Link>
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item asChild className={styles.menuItem}>
            <Link to="/compte">Paramètres du compte</Link>
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={styles.separator} />
          <DropdownMenu.Label className={styles.menuLabel}>Thème</DropdownMenu.Label>
          <DropdownMenu.RadioGroup
            value={appearance.mode}
            onValueChange={(v) => appearance.change({ mode: v as ThemeChoice })}
          >
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
          <DropdownMenu.Item
            className={styles.menuItem}
            onSelect={() => (hasUnsavedText() ? setConfirming(true) : signout())}
          >
            Se déconnecter
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        // Le menu est fermé : le focus revient au bouton du compte.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          trigger.current?.focus();
        }}
        title="Du texte n’est pas encore enregistré"
        description="Une modification d’un chapitre n’a pas pu être enregistrée. En vous déconnectant maintenant, elle sera perdue."
        footer={
          <>
            <Button variant="primary" onClick={() => setConfirming(false)}>
              Ne pas me déconnecter
            </Button>
            <Button variant="danger" onClick={signout}>
              Se déconnecter quand même
            </Button>
          </>
        }
      >
        <p>Revenez à l’éditeur et attendez « Enregistré » avant de vous déconnecter.</p>
      </Dialog>
    </>
  );
}

/** Notifications (#33), avec le nombre de non lues (dit en toutes lettres au lecteur d’écran). */
function NotificationsLink() {
  const unread = useUnreadNotifications().data ?? 0;
  return (
    <li>
      <NavLink to="/notifications" className={navLinkClass}>
        Notifications
        {unread > 0 && (
          <>
            {' '}
            <span className={styles.badge} aria-hidden="true">
              {unread > 99 ? '99+' : unread}
            </span>
            <span className="visually-hidden">
              ({unread > 1 ? `${unread} non lues` : '1 non lue'})
            </span>
          </>
        )}
      </NavLink>
    </li>
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
            {auth.isAuthenticated && <NotificationsLink />}
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

  // L'historique de lecture n'est plus gardé sur l'appareil : il est sur le compte, dans
  // Mes lectures (#30, décision 54 amendée). L'ancien est effacé.
  useEffect(() => {
    forgetReadings();
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, [location.pathname]);

  return (
    <>
      <a href="#contenu" className={styles.skip}>
        Aller au contenu
      </a>
      <AppearanceSync />
      <Header />
      <main id="contenu" ref={main} tabIndex={-1} className={styles.main}>
        <SigninError />
        <AppStatus />
        <OutboxSync />
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
              <Link to="/conditions">Conditions d’utilisation</Link>
            </li>
            <li>
              <Link to="/confidentialite">Confidentialité</Link>
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
