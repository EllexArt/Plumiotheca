import { MajorWarning, NewStory, Rating, type StoryDetail } from '@plumiotheca/contracts';
import { useState, type FormEvent } from 'react';
import { Button } from '../../shared/ui/Button';
import { Alert } from '../../shared/ui/Feedback';
import { Checkbox, RadioGroup, TextArea, TextField } from '../../shared/ui/Field';
import { ratingHint, ratingLabel, warningLabel } from './labels';
import styles from './Writing.module.css';

type Field = 'title' | 'summary' | 'rating' | 'majorWarnings' | 'tags';
type Errors = Partial<Record<Field, string>>;

const SPECIFIC = MajorWarning.options.filter((w) => w !== 'unspecified');

/**
 * Avertissements majeurs (§5 ter, charte 4.1) : un choix actif. « Aucun » se coche
 * volontairement ; sans aucun choix, l'histoire ne peut pas encore être publiée (null).
 */
function readWarnings(form: FormData): { value: MajorWarning[] | null; error?: string } {
  const none = form.get('aucunAvertissement') === 'on';
  const unspecified = form.get('nonPrecise') === 'on';
  const specific = form.getAll('warnings') as MajorWarning[];
  if ([none, unspecified, specific.length > 0].filter(Boolean).length > 1) {
    return {
      value: null,
      error:
        'Choisissez une seule possibilité : aucun avertissement, les avertissements qui s’appliquent, ou « je préfère ne pas préciser ».',
    };
  }
  if (none) return { value: [] };
  if (unspecified) return { value: ['unspecified'] };
  return { value: specific.length ? specific : null };
}

/** Informations d'une histoire : création et modification (même formulaire). */
export function StoryForm({
  story,
  submitLabel,
  pendingLabel,
  pending,
  error,
  onSubmit,
}: {
  story?: StoryDetail;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  error?: string | undefined;
  onSubmit: (values: NewStory) => void;
}) {
  const [errors, setErrors] = useState<Errors>({});
  const warnings = story?.majorWarnings ?? null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const majorWarnings = readWarnings(form);
    const parsed = NewStory.safeParse({
      title: form.get('title'),
      summary: form.get('summary'),
      language: story?.language ?? 'fr',
      rating: form.get('rating') || null,
      majorWarnings: majorWarnings.value,
      tags: String(form.get('tags') ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    const next: Errors = {};
    if (majorWarnings.error) next.majorWarnings = majorWarnings.error;
    if (!parsed.success) {
      for (const issue of parsed.error.issues)
        next[String(issue.path[0]) as Field] ??= issue.message;
    }
    setErrors(next);
    if (!parsed.success || majorWarnings.error) {
      // Focus sur le premier champ en erreur, une fois les messages affichés.
      const formElement = event.currentTarget;
      requestAnimationFrame(() =>
        formElement
          .querySelector<HTMLElement>('[aria-invalid="true"], [aria-describedby*="erreur"]')
          ?.focus(),
      );
      return;
    }
    onSubmit(parsed.data);
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <TextField
        label="Titre"
        name="title"
        required
        maxLength={200}
        defaultValue={story?.title}
        error={errors.title}
      />
      <TextArea
        label="Résumé"
        name="summary"
        hint="Quelques lignes pour donner envie, sans tout dévoiler."
        maxLength={4000}
        defaultValue={story?.summary}
        error={errors.summary}
      />
      <RadioGroup
        label="Classement"
        name="rating"
        hint="À choisir pour publier ; un classement honnête est une règle de la charte (4.1)."
        error={errors.rating}
        defaultChoice={story?.rating ?? undefined}
        choices={Rating.options.map((r) => ({
          value: r,
          label: ratingLabel[r],
          hint: ratingHint[r],
        }))}
      />
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Avertissements majeurs</legend>
        <p className={styles.meta}>
          À renseigner pour publier : cochez ceux qui s’appliquent, ou « aucun avertissement majeur
          ».
        </p>
        <Checkbox
          name="aucunAvertissement"
          label="Aucun avertissement majeur"
          defaultChecked={warnings !== null && warnings.length === 0}
        />
        {SPECIFIC.map((w) => (
          <Checkbox
            key={w}
            name="warnings"
            value={w}
            label={warningLabel[w]}
            defaultChecked={warnings?.includes(w)}
          />
        ))}
        <Checkbox
          name="nonPrecise"
          label="Je préfère ne pas préciser"
          hint="Les personnes qui lisent seront prévenues que des avertissements ne sont pas précisés."
          defaultChecked={warnings?.includes('unspecified')}
          error={errors.majorWarnings}
        />
      </fieldset>
      <TextField
        label="Tags"
        name="tags"
        hint="Séparés par des virgules : fantasy, slow burn, found family…"
        defaultValue={story?.tags.join(', ')}
        error={errors.tags}
      />
      {error && (
        <Alert tone="danger" live title="Les informations n’ont pas été enregistrées.">
          <p>{error}</p>
        </Alert>
      )}
      <div>
        <Button type="submit" variant="primary" pending={pending}>
          {pending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
