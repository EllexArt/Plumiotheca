import {
  Handle,
  HANDLE_CHANGE_DAYS,
  HANDLE_MAX,
  HANDLE_MIN,
  HANDLE_RELEASE_DAYS,
  handleKey,
  UpdateProfile,
} from '@plumiotheca/contracts';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../shared/api/client';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { Alert, Loading } from '../../shared/ui/Feedback';
import { TextArea, TextField } from '../../shared/ui/Field';
import { Page } from '../../shared/ui/Page';
import prose from '../../shared/ui/Prose.module.css';
import { formatDate } from '../stories/labels';
import { StoryList } from '../stories/ReadingPages';
import {
  checkImage,
  useChangeHandle,
  useMyAccount,
  usePublicProfile,
  useRemoveAvatar,
  useSetAvatar,
  useUpdateProfile,
  type UploadPhase,
} from './api';
import styles from './ProfilePages.module.css';

/** Texte libre en paragraphes (lignes vides) et retours à la ligne, sans HTML. */
function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n\s*\n/).map((paragraph, i) => (
        <p key={i} className={styles.preLine}>
          {paragraph}
        </p>
      ))}
    </>
  );
}

/** Focus sur le premier champ en erreur, une fois les messages affichés. */
function focusFirstInvalid(form: HTMLFormElement) {
  requestAnimationFrame(() => form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
}

/** Profil public (#26) : présentation et histoires publiées. Aucune donnée d'identité. */
export function PublicProfilePage() {
  const { handle = '' } = useParams();
  const profile = usePublicProfile(handle);
  const me = useMyAccount();

  if (profile.isPending) return <Loading label="Chargement du profil…" />;
  if (profile.isError) {
    // 400 : pseudonyme impossible (lien mal tapé), donc introuvable lui aussi.
    const missing = profile.error instanceof ApiError && [400, 404].includes(profile.error.status);
    return (
      <Page
        title={missing ? 'Profil introuvable' : 'Chargement impossible'}
        width="narrow"
        lead={missing ? 'Ce pseudonyme n’existe pas, ou plus.' : undefined}
      >
        {!missing && (
          <Alert tone="danger" live title="Ce profil n’a pas pu être chargé.">
            <p>{profile.error.message}</p>
          </Alert>
        )}
      </Page>
    );
  }
  const p = profile.data;
  const name = p.displayName ?? `@${p.handle}`;
  const mine = !!me.data?.handle && handleKey(me.data.handle) === handleKey(p.handle);

  return (
    <Page
      documentTitle={name}
      title={
        <>
          {name}
          {p.pronouns && (
            <>
              {' '}
              <span className={styles.pronouns}>({p.pronouns})</span>
            </>
          )}
        </>
      }
      lead={p.displayName ? `@${p.handle}` : undefined}
    >
      {p.avatarUrl && (
        // Décoratif : le nom est dans le titre juste au-dessus.
        <img className={styles.avatar} src={p.avatarUrl} alt="" width={128} height={128} />
      )}
      {mine && (
        <div>
          <ButtonLink to="/compte" variant="secondary" size="small">
            Modifier mon profil
          </ButtonLink>
        </div>
      )}
      {p.bio && (
        <section aria-labelledby="presentation" className={prose.prose}>
          <h2 id="presentation">Présentation</h2>
          <Paragraphs text={p.bio} />
        </section>
      )}
      <section aria-labelledby="histoires" className={styles.section}>
        <h2 id="histoires">Histoires</h2>
        <StoryList
          filters={{ pseudonyme: p.handle }}
          label={`Histoires de ${name}`}
          empty={<p>Aucune histoire publiée pour l’instant.</p>}
        />
      </section>
    </Page>
  );
}

/** Paramètres du compte (#26) : avatar, profil public et pseudonyme. */
export function AccountSettingsPage() {
  const account = useMyAccount();
  if (account.isPending) return <Loading label="Chargement de votre compte…" />;
  if (account.isError) {
    return (
      <Page title="Compte indisponible" width="narrow">
        <Alert tone="danger" live title="Votre compte n’a pas pu être chargé.">
          <p>{account.error.message}</p>
        </Alert>
      </Page>
    );
  }
  const a = account.data;
  return (
    <Page
      title="Paramètres du compte"
      width="narrow"
      lead="Ce que vous montrez aux autres. Aucune donnée d’identité n’est demandée : votre e-mail reste privé et n’apparaît nulle part."
    >
      {a.handle && (
        <p>
          <Link to={`/profils/${encodeURIComponent(a.handle)}`}>Voir mon profil public</Link>
        </p>
      )}
      <AvatarForm current={a.avatarUrl} />
      <ProfileForm initial={{ displayName: a.displayName, pronouns: a.pronouns, bio: a.bio }} />
      <HandleForm
        key={a.handle ?? ''}
        current={a.handle ?? ''}
        changeableFrom={a.handleChangeableFrom}
      />
      <section aria-labelledby="donnees" className={styles.section}>
        <h2 id="donnees">Vos données</h2>
        <p>
          L’export de vos données et la suppression du compte arrivent bientôt. La suppression vous
          laissera choisir d’effacer ou d’anonymiser vos contributions. Ce que nous gardons et
          combien de temps : <Link to="/confidentialite">politique de confidentialité</Link>.
        </p>
      </section>
    </Page>
  );
}

const PHASES: Record<UploadPhase, string> = {
  envoi: 'Envoi de l’image…',
  traitement: 'Vérification et préparation de l’image…',
  enregistrement: 'Enregistrement de l’avatar…',
};

/**
 * Avatar (#26) : envoi direct vers le stockage, puis traitement. Les étapes sont annoncées
 * poliment ; une erreur va sous le champ, qui reprend le focus.
 */
function AvatarForm({ current }: { current: string | null }) {
  const [phase, setPhase] = useState<UploadPhase>();
  const [error, setError] = useState<string>();
  const upload = useSetAvatar(setPhase);
  const remove = useRemoveAvatar();
  const busy = upload.isPending || remove.isPending;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const element = event.currentTarget;
    const refuse = (message: string) => {
      setError(message);
      focusFirstInvalid(element);
    };
    const file = (element.elements.namedItem('avatar') as HTMLInputElement | null)?.files?.[0];
    if (!file || file.size === 0) return refuse('Choisissez une image.');
    const problem = checkImage(file);
    if (problem) return refuse(problem);
    setError(undefined);
    remove.reset();
    upload.mutate(file, {
      onError: (e) => refuse(e.message),
      onSuccess: () => element.reset(),
      onSettled: () => setPhase(undefined),
    });
  };

  const status = phase
    ? PHASES[phase]
    : upload.isSuccess
      ? 'Avatar enregistré.'
      : remove.isSuccess
        ? 'Avatar retiré.'
        : '';

  return (
    <section aria-labelledby="avatar" className={styles.section}>
      <h2 id="avatar">Avatar</h2>
      {current ? (
        <img
          className={styles.avatar}
          src={current}
          alt="Votre avatar actuel"
          width={128}
          height={128}
        />
      ) : (
        <p className={styles.meta}>Pas d’avatar pour l’instant.</p>
      )}
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label="Nouvelle image"
          name="avatar"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hint="JPEG, PNG ou WebP, 10 Mo au plus. Recadrée en carré. Les informations cachées dans la photo (lieu, appareil, date) sont retirées. Pour rester anonyme, évitez une photo de votre visage (charte, 3.3)."
          error={error}
          status={status}
        />
        {remove.isError && (
          <Alert tone="danger" live title="L’avatar n’a pas été retiré.">
            <p>{remove.error.message}</p>
          </Alert>
        )}
        <div className={styles.actions}>
          <Button type="submit" variant="secondary" pending={upload.isPending}>
            {upload.isPending ? 'Envoi…' : 'Enregistrer l’avatar'}
          </Button>
          {current && (
            <Button
              type="button"
              variant="secondary"
              pending={remove.isPending}
              onClick={() => {
                if (busy) return;
                upload.reset();
                setError(undefined);
                remove.mutate();
              }}
            >
              Retirer l’avatar
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

type ProfileErrors = Partial<Record<'displayName' | 'pronouns' | 'bio', string>>;

function ProfileForm({
  initial,
}: {
  initial: { displayName: string | null; pronouns: string | null; bio: string | null };
}) {
  const update = useUpdateProfile();
  const [errors, setErrors] = useState<ProfileErrors>({});

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (update.isPending) return;
    const element = event.currentTarget;
    const form = new FormData(element);
    // Champ vidé : la valeur est effacée (null).
    const value = (name: string) => String(form.get(name) ?? '').trim() || null;
    const parsed = UpdateProfile.safeParse({
      displayName: value('displayName'),
      pronouns: value('pronouns'),
      bio: value('bio'),
    });
    if (!parsed.success) {
      const next: ProfileErrors = {};
      for (const issue of parsed.error.issues) {
        next[String(issue.path[0]) as keyof ProfileErrors] ??= issue.message;
      }
      setErrors(next);
      focusFirstInvalid(element);
      return;
    }
    setErrors({});
    update.mutate(parsed.data, {
      onError: (e) => {
        // Nom réservé : l'erreur va sous « Nom affiché », pas dans une alerte générale.
        if (e instanceof ApiError && e.type === 'nom-reserve') {
          setErrors({ displayName: e.message });
          focusFirstInvalid(element);
        }
      },
    });
  };
  // Nouvelle saisie : l'ancien résultat (« Profil enregistré », erreur) n'est plus vrai.
  const edited = () => {
    if (update.isSuccess || update.isError) update.reset();
  };
  const general =
    update.isError && !(update.error instanceof ApiError && update.error.type === 'nom-reserve');

  return (
    <section aria-labelledby="profil-public" className={styles.section}>
      <h2 id="profil-public">Profil public</h2>
      <form className={styles.form} onSubmit={submit} onChange={edited} noValidate>
        <TextField
          label="Nom affiché"
          name="displayName"
          hint="Facultatif. Sinon, votre pseudonyme est affiché."
          maxLength={50}
          defaultValue={initial.displayName ?? ''}
          error={errors.displayName}
        />
        <TextField
          label="Pronoms"
          name="pronouns"
          hint="Facultatif, affiché à côté de votre nom : elle, il, iel…"
          maxLength={30}
          defaultValue={initial.pronouns ?? ''}
          error={errors.pronouns}
        />
        <TextArea
          label="Présentation"
          name="bio"
          hint="Ce que vous écrivez, ce que vous aimez lire. Évitez d’y mettre votre nom, votre école ou vos coordonnées (charte, 3.3)."
          maxLength={2000}
          defaultValue={initial.bio ?? ''}
          error={errors.bio}
        />
        {general && (
          <Alert tone="danger" live title="Le profil n’a pas été enregistré.">
            <p>{update.error?.message}</p>
          </Alert>
        )}
        {update.isSuccess && <Alert tone="success" live title="Profil enregistré." />}
        <div>
          <Button type="submit" variant="primary" pending={update.isPending}>
            {update.isPending ? 'Enregistrement…' : 'Enregistrer le profil'}
          </Button>
        </div>
      </form>
    </section>
  );
}

function HandleForm({
  current,
  changeableFrom,
}: {
  current: string;
  changeableFrom: string | null;
}) {
  const change = useChangeHandle();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const locked = changeableFrom !== null && new Date(changeableFrom) > new Date();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (change.isPending) return;
    const element = event.currentTarget;
    const refuse = (message: string | undefined) => {
      setError(message);
      focusFirstInvalid(element);
    };
    const parsed = Handle.safeParse(new FormData(element).get('handle'));
    if (!parsed.success) return refuse(parsed.error.issues[0]?.message);
    if (parsed.data === current) return refuse('C’est déjà votre pseudonyme.');
    // Pendant le délai, seules la casse et les accents peuvent changer (comme dans l'API).
    if (locked && changeableFrom && handleKey(parsed.data) !== handleKey(current)) {
      return refuse(
        `Prochain changement possible le ${formatDate(changeableFrom)}. D’ici là, seules les majuscules et les accents peuvent changer.`,
      );
    }
    setError(undefined);
    change.mutate(
      { handle: parsed.data },
      {
        onError: (e) =>
          setError(e instanceof ApiError ? (e.fieldError('handle') ?? e.message) : undefined),
        onSuccess: (account) => {
          if (account.handle) void navigate(`/profils/${encodeURIComponent(account.handle)}`);
        },
      },
    );
  };

  return (
    <section aria-labelledby="pseudonyme" className={styles.section}>
      <h2 id="pseudonyme">Pseudonyme</h2>
      <p className={styles.meta}>
        Il change une fois tous les {HANDLE_CHANGE_DAYS} jours au plus. L’ancien reste réservé
        pendant {HANDLE_RELEASE_DAYS} jours, pour que personne ne puisse se faire passer pour vous.
      </p>
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label="Nouveau pseudonyme"
          name="handle"
          hint={
            <>
              De {HANDLE_MIN} à {HANDLE_MAX} caractères : lettres (accents compris), chiffres,
              point, tiret et tiret bas.
              {locked && changeableFrom && (
                <>
                  {' '}
                  <strong>
                    Prochain changement possible le {formatDate(changeableFrom)} ; d’ici là, seules
                    les majuscules et les accents peuvent changer.
                  </strong>
                </>
              )}
            </>
          }
          defaultValue={current}
          autoComplete="nickname"
          autoCapitalize="none"
          spellCheck={false}
          error={error}
        />
        <div>
          <Button type="submit" variant="secondary" pending={change.isPending}>
            {change.isPending ? 'Changement…' : 'Changer de pseudonyme'}
          </Button>
        </div>
      </form>
    </section>
  );
}
