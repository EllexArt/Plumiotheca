import { CHARTER_VERSION } from '@plumiotheca/contracts';
import { useNavigate } from 'react-router';
import { Markdown } from '../../shared/markdown';
import { Button } from '../../shared/ui/Button';
import { Alert } from '../../shared/ui/Feedback';
import { Page } from '../../shared/ui/Page';
import prose from '../../shared/ui/Prose.module.css';
import { useAcceptCharter } from './api';
import { charterBody } from './charter';

/** Charte de la communauté, lisible par toutes et tous, même sans compte. */
export function CharterPage() {
  return (
    <Page title="Charte de la communauté" width="narrow">
      <div className={prose.prose}>
        <Markdown source={charterBody} headingOffset={0} />
      </div>
    </Page>
  );
}

/** La charte a changé depuis la dernière acceptation : relire puis accepter. */
export function AcceptCharterPage() {
  const accept = useAcceptCharter();
  const navigate = useNavigate();

  return (
    <Page
      title="La charte a évolué"
      lead="Pour continuer, prenez le temps de relire la nouvelle version. Si vous ne l’acceptez pas, vous pourrez exporter vos données et supprimer votre compte."
      width="narrow"
    >
      <section aria-labelledby="charte-texte" className={prose.prose}>
        <h2 id="charte-texte">Charte, version {CHARTER_VERSION}</h2>
        <Markdown source={charterBody} headingOffset={1} />
      </section>
      {accept.isError && (
        <Alert tone="danger" live title="L’acceptation n’a pas été enregistrée.">
          <p>{accept.error.message}</p>
        </Alert>
      )}
      <div>
        <Button
          variant="primary"
          pending={accept.isPending}
          onClick={() =>
            accept.mutate(
              { charterVersion: CHARTER_VERSION },
              { onSuccess: () => void navigate('/', { replace: true }) },
            )
          }
        >
          {accept.isPending ? 'Enregistrement…' : 'J’accepte la charte'}
        </Button>
      </div>
    </Page>
  );
}
