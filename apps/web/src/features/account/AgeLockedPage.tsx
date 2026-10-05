import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'react-oidc-context';
import { Button } from '../../shared/ui/Button';
import { Page } from '../../shared/ui/Page';
import prose from '../../shared/ui/Prose.module.css';
import { clearBackups } from '../editor/backup';
import { forgetReadings } from '../stories/progress';

/** Moins de 15 ans déclarés (décisions 42 et 45) : compte fermé, supprimé sous 30 jours. */
export function AgeLockedPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  return (
    <Page title="À bientôt, dans quelques années" width="narrow">
      <div className={prose.prose}>
        <p>
          Plumiotheca est ouverte à partir de 15 ans. Votre compte est donc fermé, et il sera
          supprimé dans les 30 jours avec tout ce qu’il contient.
        </p>
        <p>
          Ce n’est pas une punition : c’est une règle pour protéger les plus jeunes. Vous pourrez
          créer un nouveau compte le jour de vos 15 ans. D’ici là, continuez d’écrire, dans un
          carnet ou ailleurs : vos histoires vous attendront.
        </p>
        <p>
          Si quelque chose vous inquiète ou vous fait du mal, vous pouvez en parler gratuitement et
          sans donner votre nom au 119 (enfance en danger) ou au 3018 (harcèlement en ligne).
        </p>
      </div>
      <div>
        <Button
          variant="secondary"
          onClick={() => {
            queryClient.clear();
            clearBackups();
            forgetReadings();
            void auth.signoutRedirect();
          }}
        >
          Se déconnecter
        </Button>
      </div>
    </Page>
  );
}
