import {
  ContentWarning,
  MajorWarning,
  NewStory,
  Rating,
  type StoryDetail,
} from '@plumiotheca/contracts';
import { useState, type FormEvent } from 'react';
import { Button } from '../../shared/ui/Button';
import { Alert } from '../../shared/ui/Feedback';
import { Checkbox, RadioGroup, TextArea, TextField } from '../../shared/ui/Field';
import { contentWarningLabel, ratingHint, ratingLabel, warningLabel } from './labels';
import styles from './Writing.module.css';

type Field = 'title' | 'summary' | 'rating' | 'majorWarnings' | 'contentWarnings' | 'tags';
export type Errors = Partial<Record<Field, string>>;

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

/**
 * Lit les champs d'une histoire dans un formulaire (création, modification, publication).
 * Le titre et le résumé absents du formulaire sont repris de l'histoire.
 */
export function readStoryForm(
  element: HTMLFormElement,
  story?: StoryDetail,
): { values: NewStory | null; errors: Errors } {
  const form = new FormData(element);
  const majorWarnings = readWarnings(form);
  const parsed = NewStory.safeParse({
    title: form.has('title') ? form.get('title') : story?.title,
    summary: form.has('summary') ? form.get('summary') : story?.summary,
    language: story?.language ?? 'fr',
    rating: form.get('rating') || null,
    majorWarnings: majorWarnings.value,
    contentWarnings: form.getAll('contentWarnings'),
    tags: String(form.get('tags') ?? '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  });
  const errors: Errors = {};
  if (majorWarnings.error) errors.majorWarnings = majorWarnings.error;
  if (!parsed.success) {
    for (const issue of parsed.error.issues)
      errors[String(issue.path[0]) as Field] ??= issue.message;
  }
  return { values: parsed.success && !majorWarnings.error ? parsed.data : null, errors };
}

/** Focus sur le premier champ en erreur, une fois les messages affichés. */
export function focusFirstError(form: HTMLFormElement) {
  requestAnimationFrame(() =>
    form.querySelector<HTMLElement>('[aria-invalid="true"], [aria-describedby*="erreur"]')?.focus(),
  );
}

/** Classement, avertissements et tags : ce qu'on vérifie avant de publier. */
export function StoryFields({
  story,
  errors,
}: {
  story?: StoryDetail | undefined;
  errors: Errors;
}) {
  const warnings = story?.majorWarnings ?? null;
  return (
    <>
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
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Autres avertissements (facultatif)</legend>
        <p className={styles.meta}>
          Pour que les personnes qui lisent puissent éviter un sujet difficile pour elles.
        </p>
        <div className={styles.choices}>
          {ContentWarning.options.map((w) => (
            <Checkbox
              key={w}
              name="contentWarnings"
              value={w}
              label={contentWarningLabel[w]}
              defaultChecked={story?.contentWarnings.includes(w)}
            />
          ))}
        </div>
      </fieldset>
      <TextField
        label="Tags"
        name="tags"
        hint="Séparés par des virgules : fantasy, slow burn, found family…"
        defaultValue={story?.tags.join(', ')}
        error={errors.tags}
      />
    </>
  );
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

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const { values, errors: next } = readStoryForm(event.currentTarget, story);
    setErrors(next);
    if (!values) {
      focusFirstError(event.currentTarget);
      return;
    }
    onSubmit(values);
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
      <StoryFields story={story} errors={errors} />
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
