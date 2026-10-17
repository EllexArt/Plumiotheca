import { ContentWarning, MajorWarning, MAX_HIDDEN_TAGS, TagName } from '@plumiotheca/contracts';
import { useState, type FormEvent } from 'react';
import { Button } from '../../shared/ui/Button';
import { Alert } from '../../shared/ui/Feedback';
import { Checkbox, TextField } from '../../shared/ui/Field';
import { contentWarningLabel, warningLabel } from './labels';
import { useLimits } from './limits';
import styles from './Reading.module.css';

const toggled = <T,>(list: T[], value: T, checked: boolean) =>
  checked ? [...list, value] : list.filter((v) => v !== value);

/**
 * Mes limites (#152, #81) : avertissements facultatifs, avertissements majeurs et tags à
 * masquer. Chaque choix s'applique aussitôt à toutes les listes et à la recherche ; ce qui
 * est masqué reste consultable (« Les afficher pour cette fois »).
 */
export function LimitsPanel() {
  const { limits, change, onAccount, saveFailed } = useLimits();
  return (
    <div className={styles.limitsPanel}>
      <p className={styles.meta}>
        {onAccount
          ? 'Gardé sur votre compte, appliqué partout : Explorer, recherche, profils, sélections.'
          : 'Pour cette visite seulement. Connectez-vous pour le garder.'}
      </p>
      <fieldset className={styles.limits}>
        <legend>Masquer les histoires qui abordent…</legend>
        <div className={styles.limitsOptions}>
          {ContentWarning.options.map((warning) => (
            <Checkbox
              key={warning}
              label={contentWarningLabel[warning]}
              name="masquer"
              value={warning}
              checked={limits.hiddenContentWarnings.includes(warning)}
              onChange={(e) =>
                change({
                  hiddenContentWarnings: toggled(
                    limits.hiddenContentWarnings,
                    warning,
                    e.target.checked,
                  ),
                })
              }
            />
          ))}
        </div>
      </fieldset>
      <fieldset className={styles.limits}>
        <legend>… ou qui portent ces avertissements majeurs</legend>
        <div className={styles.limitsOptions}>
          {MajorWarning.options.map((warning) => (
            <Checkbox
              key={warning}
              label={warningLabel[warning]}
              name="masquer-majeurs"
              value={warning}
              checked={limits.hiddenMajorWarnings.includes(warning)}
              onChange={(e) =>
                change({
                  hiddenMajorWarnings: toggled(
                    limits.hiddenMajorWarnings,
                    warning,
                    e.target.checked,
                  ),
                })
              }
            />
          ))}
        </div>
      </fieldset>
      <HiddenTags tags={limits.hiddenTags} onChange={(hiddenTags) => change({ hiddenTags })} />
      {saveFailed && (
        <Alert tone="danger" live title="Vos limites n’ont pas pu être enregistrées.">
          <p>Elles restent appliquées ici ; réessayez plus tard.</p>
        </Alert>
      )}
    </div>
  );
}

/** Tags à masquer : un champ pour en ajouter, un bouton pour retirer chacun. */
function HiddenTags({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [error, setError] = useState<string>();
  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = TagName.safeParse(String(new FormData(form).get('tag') ?? '').trim());
    const refuse = (message: string | undefined) => {
      setError(message);
      requestAnimationFrame(() => form.querySelector<HTMLElement>('input')?.focus());
    };
    if (!parsed.success) return refuse(parsed.error.issues[0]?.message);
    if (tags.length >= MAX_HIDDEN_TAGS) return refuse(`${MAX_HIDDEN_TAGS} tags au plus.`);
    setError(undefined);
    onChange([...tags, parsed.data]);
    form.reset();
  };
  return (
    // Groupe nommé (et non un titre) : le panneau va aussi bien sous un h1 que sous un h2.
    <fieldset className={styles.limits}>
      <legend>… ou qui portent ces tags</legend>
      {tags.length ? (
        <ul className={styles.tagList} aria-label="Tags masqués">
          {tags.map((tag) => (
            <li key={tag}>
              <span>{tag}</span>{' '}
              <Button
                variant="ghost"
                size="small"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
              >
                Retirer <span className="visually-hidden">le tag « {tag} »</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.meta}>Aucun tag masqué.</p>
      )}
      <form className={styles.search} onSubmit={add} noValidate>
        <TextField
          label="Masquer un tag"
          name="tag"
          hint="Casse et accents ignorés : « Slow burn » masque aussi « slow-burn »."
          maxLength={100}
          error={error}
        />
        <div>
          <Button type="submit" variant="secondary">
            Masquer ce tag
          </Button>
        </div>
      </form>
    </fieldset>
  );
}
