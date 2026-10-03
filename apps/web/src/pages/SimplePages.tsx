import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { isRouteErrorResponse, useLocation, useRouteError } from 'react-router';
import { useSignin } from '../app/Layout';
import { Button, ButtonLink } from '../shared/ui/Button';
import { Alert, Loading } from '../shared/ui/Feedback';
import { Page } from '../shared/ui/Page';

/** Mes lectures (bibliothèque, reprise : M2). */
export function ReadingsPage() {
  return (
    <Page title="Mes lectures" lead="Les histoires que vous lisez, là où vous vous êtes arrêté·e.">
      <Alert tone="info" title="Votre bibliothèque est encore vide.">
        <p>Les histoires que vous commencerez apparaîtront ici.</p>
      </Alert>
    </Page>
  );
}

/**
 * Retour de Keycloak : react-oidc-context échange le code, puis onSigninCallback ramène sur
 * la page de départ. En cas d'échec (lien périmé, onglet rouvert), on le dit simplement.
 */
export function SigninCallbackPage() {
  const auth = useAuth();
  const { signin } = useSignin();
  if (auth.error) {
    return (
      <Page title="Connexion interrompue" width="narrow">
        <Alert tone="warning" live title="La connexion n’a pas pu aboutir.">
          <p>Le lien de connexion a peut-être expiré. Vous pouvez réessayer.</p>
        </Alert>
        <div>
          <Button variant="primary" onClick={() => void signin()}>
            Se connecter
          </Button>
        </div>
      </Page>
    );
  }
  return <Loading label="Connexion en cours…" />;
}

/** Page réservée aux personnes connectées : passage par Keycloak, puis retour ici. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  const { signin } = useSignin();
  const needsSignin = !auth.isLoading && !auth.isAuthenticated && !auth.error;

  useEffect(() => {
    if (needsSignin) void signin();
    // Une seule redirection par page demandée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsSignin, location.pathname]);

  if (auth.isAuthenticated) return children;
  if (auth.error) {
    return (
      <Page title="Connexion nécessaire" width="narrow">
        {/* Échec du départ vers Keycloak : déjà annoncé par le bandeau du cadre. */}
        {!['signinRedirect', 'signoutRedirect'].includes(
          (auth.error as { source?: string }).source ?? '',
        ) && (
          <Alert tone="warning" title="Le service de connexion ne répond pas.">
            <p>Réessayez dans un instant.</p>
          </Alert>
        )}
        <div>
          <Button variant="primary" onClick={() => void signin()}>
            Se connecter
          </Button>
        </div>
      </Page>
    );
  }
  return <Loading label="Redirection vers la connexion…" />;
}

export function NotFoundPage() {
  return (
    <Page title="Page introuvable" width="narrow" lead="Cette page n’existe pas, ou plus.">
      <div>
        <ButtonLink to="/" variant="primary">
          Revenir à l’accueil
        </ButtonLink>
      </div>
    </Page>
  );
}

/** Erreur inattendue pendant l'affichage d'une page : jamais d'écran blanc. */
export function ErrorPage() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return (
    <Page title="Une erreur est survenue" width="narrow">
      <Alert tone="danger" title="Cette page n’a pas pu s’afficher.">
        <p>Rechargez la page. Si le problème continue, signalez-le à l’équipe.</p>
      </Alert>
      <div>
        <ButtonLink to="/" variant="primary">
          Revenir à l’accueil
        </ButtonLink>
      </div>
    </Page>
  );
}
