import type { ReactNode } from 'react';
import { useAuth } from 'react-oidc-context';
import { Navigate, useLocation } from 'react-router';
import { stepPath, useMyAccount } from '../features/account/api';
import { Button } from '../shared/ui/Button';
import { Alert, Loading } from '../shared/ui/Feedback';
import { Page } from '../shared/ui/Page';
import styles from './AccountGate.module.css';

/** Pages lisibles sans compte : elles restent ouvertes si le compte ne se charge pas. */
const PUBLIC_PATHS = ['/', '/charte', '/design-system', '/connexion'];
const PUBLIC_PREFIXES = ['/histoires/', '/profils/'];
const isPublic = (path: string) =>
  PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
/** Pages de l'accueil : sans objet une fois le compte prêt. */
const ONBOARDING_PATHS = Object.values(stepPath);

/**
 * Une personne connectée qui n'a pas terminé l'accueil (pseudonyme, âge, charte) y est
 * conduite avant toute autre page : l'API refuse de toute façon le reste (refus par défaut).
 * La charte se lit à toute étape. Les visites anonymes ne sont pas concernées.
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const { pathname } = useLocation();
  const account = useMyAccount();

  if (!auth.isAuthenticated) return children;
  if (account.isPending) return <Loading label="Ouverture de votre compte…" />;

  if (account.isError) {
    const alert = (
      <Alert tone="danger" live title="Votre compte n’a pas pu être chargé.">
        <p>{account.error.message}</p>
        <div>
          <Button
            size="small"
            pending={account.isFetching}
            onClick={() =>
              void account.refetch().then((result) => {
                if (!result.isError) document.getElementById('contenu')?.focus();
              })
            }
          >
            Réessayer
          </Button>
        </div>
      </Alert>
    );
    // Les pages publiques restent lisibles, avec le message au-dessus.
    if (isPublic(pathname)) {
      return (
        <>
          <div className={styles.banner}>{alert}</div>
          {children}
        </>
      );
    }
    return (
      <Page title="Compte indisponible" width="narrow">
        {alert}
      </Page>
    );
  }

  const { step } = account.data;
  if (step === 'ready') {
    return ONBOARDING_PATHS.includes(pathname) ? <Navigate to="/" replace /> : children;
  }
  const target = stepPath[step];
  if (pathname !== target && pathname !== '/charte') return <Navigate to={target} replace />;
  return children;
}
