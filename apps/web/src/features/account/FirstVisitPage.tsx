import { zodResolver } from '@hookform/resolvers/zod';
import {
  CHARTER_VERSION,
  DeclaredAge,
  Handle,
  HANDLE_MAX,
  HANDLE_MIN,
} from '@plumiotheca/contracts';
import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';
import { ApiError } from '../../shared/api/client';
import { Markdown } from '../../shared/markdown';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { Alert } from '../../shared/ui/Feedback';
import { Checkbox, RadioGroup, TextField } from '../../shared/ui/Field';
import { Page } from '../../shared/ui/Page';
import prose from '../../shared/ui/Prose.module.css';
import { useFirstVisit, useHandleAvailability } from './api';
import { charterBody } from './charter';
import styles from './FirstVisitPage.module.css';

const Form = z.object({
  handle: Handle,
  age: z.enum(DeclaredAge.options, { message: 'Indiquez votre âge.' }),
  charter: z.literal(true, { message: 'Acceptez la charte pour continuer.' }),
});
type FormInput = z.input<typeof Form>;
type FormOutput = z.output<typeof Form>;

/** Erreurs de l'API qui concernent le pseudonyme. */
const HANDLE_ERRORS = ['pseudonyme-indisponible', 'nom-reserve'];

/**
 * Première visite (décisions 34, 42) : pseudonyme public, tranche d'âge déclarée, charte.
 * Aucune donnée d'identité : ni nom, ni date de naissance.
 */
export function FirstVisitPage() {
  const navigate = useNavigate();
  const firstVisit = useFirstVisit();
  const isAvailable = useHandleAvailability();
  const [handleStatus, setHandleStatus] = useState<string>();
  const check = useRef<AbortController>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(Form),
    shouldFocusError: true,
  });

  const { onBlur: handleBlur, ...handleField } = register('handle', {
    onChange: () => setHandleStatus(undefined),
  });

  /** En quittant le champ : le pseudonyme est-il libre ? (l'envoi tranchera de toute façon) */
  const checkHandle = async (value: string) => {
    const parsed = Handle.safeParse(value);
    if (!parsed.success) return;
    check.current?.abort();
    const controller = new AbortController();
    check.current = controller;
    try {
      const available = await isAvailable(parsed.data, controller.signal);
      if (available) setHandleStatus(`@${parsed.data} est disponible.`);
      else setError('handle', { message: 'Ce pseudonyme est déjà pris. Essayez une variante.' });
    } catch {
      // Vérification de confort seulement.
    }
  };

  const onSubmit = (values: FormOutput) =>
    firstVisit.mutate(
      { handle: values.handle, age: values.age, charterVersion: CHARTER_VERSION },
      {
        onSuccess: (account) =>
          void navigate(account.step === 'age-locked' ? '/compte-verrouille' : '/', {
            replace: true,
          }),
        onError: (error) => {
          if (!(error instanceof ApiError)) return;
          const message =
            error.fieldError('handle') ??
            (HANDLE_ERRORS.includes(error.type) ? error.message : undefined);
          if (message) setError('handle', { message }, { shouldFocus: true });
        },
      },
    );

  const generalError =
    firstVisit.error instanceof ApiError &&
    !HANDLE_ERRORS.includes(firstVisit.error.type) &&
    !firstVisit.error.fieldError('handle')
      ? firstVisit.error.message
      : undefined;

  return (
    <Page
      title="Bienvenue sur Plumiotheca"
      lead="Trois questions avant de commencer. Ici, on écrit et on lit sous pseudonyme : nous ne vous demandons ni votre nom, ni votre date de naissance."
      width="narrow"
    >
      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
        <TextField
          label="Votre pseudonyme"
          hint={`De ${HANDLE_MIN} à ${HANDLE_MAX} caractères : lettres (accents compris), chiffres, point, tiret et tiret bas. C’est le nom que tout le monde verra ; vous pourrez le changer une fois par mois.`}
          autoComplete="nickname"
          autoCapitalize="none"
          spellCheck={false}
          required
          error={errors.handle?.message}
          status={handleStatus}
          {...handleField}
          onBlur={(event) => {
            void handleBlur(event);
            void checkHandle(event.target.value);
          }}
        />

        <RadioGroup
          label="Quel âge avez-vous ?"
          hint="Plumiotheca est ouverte à partir de 15 ans. Seule la tranche d’âge est gardée. Si vous avez moins de 15 ans, le compte sera fermé : vous pourrez revenir à vos 15 ans."
          required
          error={errors.age?.message}
          choices={[
            { value: 'under-15', label: 'Moins de 15 ans' },
            {
              value: '15-17',
              label: 'Entre 15 et 17 ans',
              hint: 'Les histoires classées Mature restent visibles avec leurs avertissements, et vous pouvez les écarter.',
            },
            { value: '18+', label: '18 ans ou plus' },
          ]}
          {...register('age')}
        />

        <div className={styles.charter}>
          <p>
            La charte dit comment on vit ensemble ici : bienveillance, aucun message privé, respect
            du pseudonymat, classements honnêtes.
          </p>
          <Dialog
            title="Charte de la communauté"
            trigger={
              <Button variant="secondary" size="small">
                Lire la charte
              </Button>
            }
          >
            <div className={prose.prose}>
              <Markdown source={charterBody} headingOffset={1} />
            </div>
          </Dialog>
          <Checkbox
            label="J’ai lu la charte et je m’engage à la respecter."
            error={errors.charter?.message}
            {...register('charter')}
          />
        </div>

        {generalError && (
          <Alert tone="danger" live title="Votre compte n’a pas pu être créé.">
            <p>{generalError}</p>
          </Alert>
        )}

        <div>
          <Button type="submit" variant="primary" disabled={firstVisit.isPending}>
            {firstVisit.isPending ? 'Enregistrement…' : 'Commencer'}
          </Button>
        </div>
      </form>
    </Page>
  );
}
