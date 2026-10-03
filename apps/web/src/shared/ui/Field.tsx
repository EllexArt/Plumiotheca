import { useId, type ComponentProps, type ReactNode } from 'react';
import styles from './Field.module.css';

interface FieldText {
  label: ReactNode;
  /** Aide permanente sous le libellé (format attendu, conséquences). */
  hint?: ReactNode;
  /** Message d'erreur ; le champ est alors annoncé comme invalide. */
  error?: string | undefined;
  /** Message de réussite (« pseudonyme disponible »), annoncé poliment. */
  status?: string | undefined;
}

const ErrorIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6M12 16.5h.01" strokeLinecap="round" />
  </svg>
);

/** Identifiants de l'aide et de l'erreur, pour aria-describedby (RGAA 11.10). */
function useDescriptions(hint: unknown, error: unknown, status: unknown) {
  const id = useId();
  const ids = {
    hint: hint ? `${id}-aide` : undefined,
    error: error ? `${id}-erreur` : undefined,
    status: `${id}-etat`,
  };
  const describedBy = [ids.hint, ids.error, status ? ids.status : undefined]
    .filter(Boolean)
    .join(' ');
  return { id, ids, describedBy: describedBy || undefined };
}

/**
 * Message d'erreur dans une zone annoncée, toujours présente : une erreur qui apparaît
 * alors que le focus est ailleurs (vérification à la sortie du champ) est lue quand même
 * (WCAG 4.1.3).
 */
function ErrorMessage({ id, error }: { id: string | undefined; error: string | undefined }) {
  return (
    <span aria-live="polite">
      {error && (
        <span id={id} className={styles.error}>
          <ErrorIcon />
          {error}
        </span>
      )}
    </span>
  );
}

/** Champ texte avec libellé visible, aide et erreur reliées au champ. */
export function TextField({
  label,
  hint,
  error,
  status,
  required,
  ...input
}: FieldText & Omit<ComponentProps<'input'>, 'id'>) {
  const { id, ids, describedBy } = useDescriptions(hint, error, status);
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span className={styles.required}> (obligatoire)</span>}
      </label>
      <input
        id={id}
        className={styles.input}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        required={required}
        {...input}
      />
      {hint && (
        <span id={ids.hint} className={styles.hint}>
          {hint}
        </span>
      )}
      <ErrorMessage id={ids.error} error={error} />
      {/* Toujours présente : une zone annoncée doit exister avant que son contenu change. */}
      <output id={ids.status} className={styles.status}>
        {status}
      </output>
    </div>
  );
}

/** Texte sur plusieurs lignes (résumé, texte d'un chapitre). */
export function TextArea({
  label,
  hint,
  error,
  required,
  className,
  ...input
}: Omit<FieldText, 'status'> & Omit<ComponentProps<'textarea'>, 'id'>) {
  const { id, ids, describedBy } = useDescriptions(hint, error, undefined);
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span className={styles.required}> (obligatoire)</span>}
      </label>
      {hint && (
        <span id={ids.hint} className={styles.hint}>
          {hint}
        </span>
      )}
      <textarea
        id={id}
        className={[styles.input, styles.textarea, className].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        required={required}
        {...input}
      />
      <ErrorMessage id={ids.error} error={error} />
    </div>
  );
}

export interface Choice {
  value: string;
  label: ReactNode;
  hint?: ReactNode;
}

/**
 * Choix unique parmi quelques options : vrais boutons radio dans un groupe nommé
 * (RGAA 11.5). L'aide et l'erreur sont reliées à chaque bouton, pas seulement au groupe
 * (aria-invalid n'existe pas pour un bouton radio, l'erreur passe par la description) :
 * les lecteurs d'écran ne lisent pas tous la description d'un fieldset.
 */
export function RadioGroup({
  label,
  hint,
  error,
  choices,
  required,
  ...input
}: Omit<FieldText, 'status'> & { choices: Choice[] } & Omit<
    ComponentProps<'input'>,
    'type' | 'id' | 'value'
  >) {
  const { id, ids, describedBy } = useDescriptions(hint, error, undefined);
  return (
    <fieldset className={styles.field}>
      <legend className={styles.label}>
        {label}
        {required && <span className={styles.required}> (obligatoire)</span>}
      </legend>
      {hint && (
        <span id={ids.hint} className={styles.hint}>
          {hint}
        </span>
      )}
      <div className={styles.options}>
        {choices.map((choice) => {
          const inputId = `${id}-${choice.value}`;
          const optionHint = choice.hint ? `${inputId}-aide` : undefined;
          return (
            <label key={choice.value} className={styles.option} htmlFor={inputId}>
              <input
                id={inputId}
                type="radio"
                value={choice.value}
                required={required}
                aria-describedby={[optionHint, describedBy].filter(Boolean).join(' ') || undefined}
                {...input}
              />
              <span className={styles.optionText}>
                {choice.label}
                {choice.hint && (
                  <span id={optionHint} className={styles.optionHint}>
                    {choice.hint}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <ErrorMessage id={ids.error} error={error} />
    </fieldset>
  );
}

/** Case à cocher avec son libellé cliquable. */
export function Checkbox({
  label,
  hint,
  error,
  ...input
}: Omit<FieldText, 'status'> & Omit<ComponentProps<'input'>, 'type' | 'id'>) {
  const { id, ids, describedBy } = useDescriptions(hint, error, undefined);
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.check}>
        <input
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...input}
        />
        <span>{label}</span>
      </label>
      {hint && (
        <span id={ids.hint} className={styles.hint}>
          {hint}
        </span>
      )}
      <ErrorMessage id={ids.error} error={error} />
    </div>
  );
}
