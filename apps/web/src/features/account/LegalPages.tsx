// Textes de référence (#37, #100), lus depuis docs/ à la construction : la page affiche
// toujours la version du dépôt (source unique, comme la charte).
import conditionsSource from '../../../../../docs/conditions.md?raw';
import privacySource from '../../../../../docs/confidentialite.md?raw';
import { Markdown } from '../../shared/markdown';
import { Page } from '../../shared/ui/Page';
import prose from '../../shared/ui/Prose.module.css';

/** Corps d’un texte, sans son titre de premier niveau (la page ou la fenêtre a le sien). */
const withoutTitle = (source: string) => source.split('\n').slice(1).join('\n');

export const conditionsBody = withoutTitle(conditionsSource);
const privacyBody = withoutTitle(privacySource);

export function PrivacyPage() {
  return (
    <Page title="Politique de confidentialité" width="narrow">
      <div className={prose.prose}>
        <Markdown source={privacyBody} headingOffset={0} />
      </div>
    </Page>
  );
}

export function ConditionsPage() {
  return (
    <Page title="Conditions d’utilisation" width="narrow">
      <div className={prose.prose}>
        <Markdown source={conditionsBody} headingOffset={0} />
      </div>
    </Page>
  );
}
