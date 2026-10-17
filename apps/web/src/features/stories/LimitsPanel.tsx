import { ContentWarning } from '@plumiotheca/contracts';
import { Alert } from '../../shared/ui/Feedback';
import { Checkbox } from '../../shared/ui/Field';
import { contentWarningLabel } from './labels';
import { useLimits } from './limits';
import styles from './Reading.module.css';

/**
 * Mes limites (#152) : cases à cocher dans un groupe nommé ; chaque choix s'applique
 * aussitôt à toutes les listes et à la recherche.
 */
export function LimitsPanel() {
  const limits = useLimits();
  const toggle = (warning: ContentWarning, checked: boolean) =>
    limits.change(
      checked ? [...limits.hidden, warning] : limits.hidden.filter((w) => w !== warning),
    );
  return (
    <fieldset className={styles.limits}>
      <legend>Masquer les histoires qui abordent…</legend>
      <p className={styles.meta}>
        {limits.onAccount
          ? 'Gardé sur votre compte, appliqué partout : Explorer, recherche, profils.'
          : 'Pour cette visite seulement. Connectez-vous pour le garder.'}
      </p>
      <div className={styles.limitsOptions}>
        {ContentWarning.options.map((warning) => (
          <Checkbox
            key={warning}
            label={contentWarningLabel[warning]}
            name="masquer"
            value={warning}
            checked={limits.hidden.includes(warning)}
            onChange={(e) => toggle(warning, e.target.checked)}
          />
        ))}
      </div>
      {limits.saveFailed && (
        <Alert tone="danger" live title="Vos limites n’ont pas pu être enregistrées.">
          <p>Elles restent appliquées ici ; réessayez plus tard.</p>
        </Alert>
      )}
    </fieldset>
  );
}
