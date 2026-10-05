import {
  Handle,
  HANDLE_CHANGE_DAYS,
  HANDLE_MAX,
  HANDLE_MIN,
  HANDLE_RELEASE_DAYS,
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
import { usePublicStories } from '../stories/api';
import { formatDate } from '../stories/labels';
import { StoryList } from '../stories/ReadingPages';
import { useChangeHandle, useMyAccount, usePublicProfile, useUpdateProfile } from './api';
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

/** Profil public (#26) : présentation et histoires publiées. Aucune donnée d'identité. */
export function PublicProfilePage() {
  const { handle = '' } = useParams();
  const profile = usePublicProfile(handle);
  const stories = usePublicStories({ pseudonyme: handle });
  const me = useMyAccount();

  if (profile.isPending) return <Loading label="Chargement du profil…" />;
  if (profile.isError) {
    const missing = profile.error instanceof ApiError && profile.error.status === 404;
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
  const noStories = stories.isSuccess && !stories.data.pages[0]?.items.length;
  const mine = me.data?.handle?.toLowerCase() === p.handle.toLowerCase();

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
        <StoryList filters={{ pseudonyme: p.handle }} label={`Histoires de ${name}`} />
        {noStories && <p>Aucune histoire publiée pour l’instant.</p>}
      </section>
    </Page>
  );
}

/** Paramètres du compte (#26) : profil public et pseudonyme. */
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
          laissera choisir d’effacer ou d’anonymiser vos contributions.
        </p>
      </section>
    </Page>
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
    const form = new FormData(event.currentTarget);
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
      return;
    }
    setErrors({});
    update.mutate(parsed.data);
  };

  return (
    <section aria-labelledby="profil-public" className={styles.section}>
      <h2 id="profil-public">Profil public</h2>
      <form className={styles.form} onSubmit={submit} noValidate>
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
        {update.isError && (
          <Alert tone="danger" live title="Le profil n’a pas été enregistré.">
            <p>{update.error.message}</p>
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
    if (change.isPending || locked) return;
    const parsed = Handle.safeParse(new FormData(event.currentTarget).get('handle'));
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    if (parsed.data === current) {
      setError('C’est déjà votre pseudonyme.');
      return;
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
      {locked && changeableFrom && (
        <Alert
          tone="info"
          title={`Prochain changement possible le ${formatDate(changeableFrom)}.`}
        />
      )}
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label="Nouveau pseudonyme"
          name="handle"
          hint={`De ${HANDLE_MIN} à ${HANDLE_MAX} caractères : lettres (accents compris), chiffres, point, tiret et tiret bas.`}
          defaultValue={current}
          autoComplete="nickname"
          autoCapitalize="none"
          spellCheck={false}
          readOnly={locked}
          error={error}
        />
        <div>
          <Button type="submit" variant="secondary" pending={change.isPending || locked}>
            {change.isPending ? 'Changement…' : 'Changer de pseudonyme'}
          </Button>
        </div>
      </form>
    </section>
  );
}
