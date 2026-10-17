// Politique de confidentialité (#100), lue depuis docs/confidentialite.md à la construction :
// la page affiche toujours la version du dépôt (source unique, comme la charte).
import source from '../../../../../docs/confidentialite.md?raw';
import { Markdown } from '../../shared/markdown';
import { Page } from '../../shared/ui/Page';
import prose from '../../shared/ui/Prose.module.css';

/** Corps du texte, sans son titre de premier niveau (la page a déjà le sien). */
const body = source.split('\n').slice(1).join('\n');

export function PrivacyPage() {
  return (
    <Page title="Politique de confidentialité" width="narrow">
      <div className={prose.prose}>
        <Markdown source={body} headingOffset={0} />
      </div>
    </Page>
  );
}
