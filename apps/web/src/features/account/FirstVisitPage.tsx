import { zodResolver } from '@hookform/resolvers/zod';
import {
  CHARTER_VERSION,
  DeclaredAge,
  Handle,
  HANDLE_MAX,
  HANDLE_MIN,
} from '@plumiotheca/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { myAccountKey, useFirstVisit, useHandleAvailability } from './api';
import { charterBody } from './charter';
import styles from './FirstVisitPage.module.css';

/**
 * Pseudonyme et charte ne sont demandés qu'à partir de 15 ans (#142). Tout est vérifié en
 * une fois (raffinement unique) : toutes les erreurs s'affichent ensemble.
 */
const Form = z
  .object({
    // Groupe de boutons radio sans choix : null (React Hook Form).
    age: DeclaredAge.nullish(),
    handle: z.string().nullish(),
    charter: z.boolean().nullish(),
  })
  .superRefine((values, ctx) => {
    if (!values.age)
      ctx.addIssue({ code: 'custom', path: ['age'], message: 'Indiquez votre âge.' });
    if (values.age === 'under-15') return;
    const handle = Handle.safeParse(values.handle ?? '');
    if (!handle.success) {
      ctx.addIssue({ code: 'custom', path: ['handle'], message: handle.error.issues[0]!.message });
    }
    if (values.charter !== true) {
      ctx.addIssue({
        code: 'custom',
        path: ['charter'],
        message: 'Acceptez la charte pour continuer.',
      });
    }
  });
type FormInput = z.input<typeof Form>;
type FormOutput = z.output<typeof Form>;

const TAKEN = 'Ce pseudonyme est déjà pris. Essayez une variante.';

/**
 * Refus qui changent l'étape du compte : moins de 15 ans (compte verrouillé), accueil
 * déjà fait (autre onglet), charte modifiée entre-temps. Le compte est relu et la garde
 * d'accueil conduit à la bonne page.
 */
const STEP_CHANGES = ['age-minimum', 'deja-fait', 'charte-perimee'];

/**
 * Première visite (décisions 34, 42) : âge déclaré en premier champ, puis pseudonyme public
 * et charte. Moins de 15 ans : ni pseudonyme ni charte, seule la réponse est envoyée
 * (minimisation, #142). Ni nom, ni date de naissance.
 */
export function FirstVisitPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const firstVisit = useFirstVisit();
  const isAvailable = useHandleAvailability();
  const [handleStatus, setHandleStatus] = useState<string>();
  const check = useRef<AbortController>(null);
  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    getValues,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(Form),
    shouldFocusError: true,
  });

  // Ordre d'enregistrement = ordre du focus sur la première erreur : l'âge d'abord.
  const ageField = register('age');
  const { onBlur: handleBlur, onChange: handleChange, ...handleField } = register('handle');

  /** Nouvelle saisie : l'ancienne vérification de disponibilité ne vaut plus. */
  const resetCheck = () => {
    check.current?.abort();
    setHandleStatus(undefined);
    if (errors.handle?.message === TAKEN) clearErrors('handle');
  };

  /** En quittant le champ : le pseudonyme est-il libre ? (l'envoi tranchera de toute façon) */
  const checkHandle = async (value: string) => {
    // Âge pas encore choisi, ou moins de 15 ans : le pseudonyme ne quitte pas l'appareil.
    const age = getValues('age');
    if (!age || age === 'under-15') return;
    const parsed = Handle.safeParse(value);
    if (!parsed.success) return;
    check.current?.abort();
    const controller = new AbortController();
    check.current = controller;
    try {
      const available = await isAvailable(parsed.data, controller.signal);
      if (controller.signal.aborted) return;
      if (available) setHandleStatus(`@${parsed.data} est disponible.`);
      else setError('handle', { message: TAKEN });
    } catch {
      // Vérification de confort seulement.
    }
  };

  const pending = isSubmitting || firstVisit.isPending;
  const underFifteen = useWatch({ control, name: 'age' }) === 'under-15';

  const onSubmit = (values: FormOutput) => {
    if (firstVisit.isPending || !values.age) return;
    firstVisit.mutate(
      values.age === 'under-15'
        ? { age: values.age }
        : {
            age: values.age,
            handle: Handle.parse(values.handle),
            charterVersion: CHARTER_VERSION,
          },
      {
        onSuccess: () => void navigate('/', { replace: true }),
        onError: (error) => {
          if (!(error instanceof ApiError)) return;
          if (STEP_CHANGES.includes(error.type)) {
            void queryClient.invalidateQueries({ queryKey: myAccountKey });
            return;
          }
          const message =
            error.fieldError('handle') ??
            (error.type === 'pseudonyme-indisponible' ? error.message : undefined);
          if (message) setError('handle', { message }, { shouldFocus: true });
        },
      },
    );
  };

  const error = firstVisit.error;
  const generalError =
    error instanceof ApiError &&
    error.type !== 'pseudonyme-indisponible' &&
    error.type !== 'age-minimum' &&
    !error.fieldError('handle')
      ? error.type === 'charte-perimee'
        ? 'La charte vient d’être mise à jour. Rechargez la page pour lire la nouvelle version.'
        : error.message
      : undefined;

  return (
    <Page
      title="Bienvenue sur Plumiotheca"
      lead="Trois questions avant de commencer. Ici, on écrit et on lit sous pseudonyme : nous ne vous demandons ni votre nom, ni votre date de naissance."
      width="narrow"
    >
      <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
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
          {...ageField}
        />

        {underFifteen ? (
          <p className={styles.note}>
            Pas besoin de pseudonyme ni de charte : nous ne gardons que votre réponse.
          </p>
        ) : (
          <>
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
              onChange={(event) => {
                void handleChange(event);
                resetCheck();
              }}
            />

            <div className={styles.charter}>
              <p>
                La charte dit comment on vit ensemble ici : bienveillance, aucun message privé,
                respect du pseudonymat, classements honnêtes.
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
          </>
        )}

        {generalError && (
          <Alert tone="danger" live title="Votre compte n’a pas pu être créé.">
            <p>{generalError}</p>
          </Alert>
        )}

        <div>
          <Button type="submit" variant="primary" pending={pending}>
            {pending ? 'Enregistrement…' : 'Commencer'}
          </Button>
        </div>
      </form>
    </Page>
  );
}
