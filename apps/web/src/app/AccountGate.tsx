import type { ReactNode } from 'react';
import { useAuth } from 'react-oidc-context';
import { Navigate, useLocation } from 'react-router';
import { stepPath, useMyAccount } from '../features/account/api';
import { Alert, Loading } from '../shared/ui/Feedback';
import { Page } from '../shared/ui/Page';

/** Pages ouvertes à chaque étape (la charte se lit toujours). */
const allowed = (path: string, target: string) => path === target || path === '/charte';

/**
 * Une personne connectée qui n'a pas terminé l'accueil (pseudonyme, âge, charte) y est
 * conduite avant toute autre page : l'API refuse de toute façon le reste (refus par défaut).
 * Les visites anonymes ne sont pas concernées.
 */
export function AccountGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  const account = useMyAccount();

  if (!auth.isAuthenticated) return children;
  if (account.isPending) return <Loading label="Ouverture de votre compte…" />;
  if (account.isError) {
    return (
      <Page title="Compte indisponible" width="narrow">
        <Alert tone="danger" title="Votre compte n’a pas pu être chargé.">
          <p>{account.error.message}</p>
        </Alert>
      </Page>
    );
  }

  const { step } = account.data;
  if (step !== 'ready' && !allowed(location.pathname, stepPath[step])) {
    return <Navigate to={stepPath[step]} replace />;
  }
  return children;
}
