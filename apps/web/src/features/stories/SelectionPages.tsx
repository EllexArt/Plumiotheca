import {
  NewSelection,
  type Selection,
  type SelectionSummary,
  type SelectionVisibility,
} from '@plumiotheca/contracts';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { Alert, Loading, Tag } from '../../shared/ui/Feedback';
import { Checkbox, RadioGroup, TextArea, TextField } from '../../shared/ui/Field';
import { Page, usePageTitle } from '../../shared/ui/Page';
import { limitReasons, useLimits } from './limits';
import { AuthorLink, StoryCard } from './ReadingPages';
import styles from './Reading.module.css';
import { plural } from './labels';
import {
  useMySelections,
  usePublicSelections,
  useSelection,
  useSelectionActions,
} from './selections';

const visibilityLabel: Record<SelectionVisibility, string> = {
  private: 'Privée',
  public: 'Publique',
};

const VISIBILITIES = [
  { value: 'private', label: 'Privée', hint: 'Vous seule ou seul la voyez.' },
  {
    value: 'public',
    label: 'Publique',
    hint: 'Tout le monde peut la voir, sur sa page et dans Explorer. Partageable par lien.',
  },
];

/** Une sélection dans une liste : titre, autrice ou auteur, aperçu de ses histoires. */
export function SelectionCard({
  selection,
  showVisibility = false,
}: {
  selection: SelectionSummary;
  showVisibility?: boolean;
}) {
  return (
    <article className={styles.selectionCard}>
      <h3 className={styles.cardTitle}>
        <Link to={`/selections/${selection.id}`}>{selection.title}</Link>
      </h3>
      <p className={styles.meta}>
        par <AuthorLink author={selection.owner} /> · {plural(selection.storyCount, 'histoire')}
        {showVisibility && (
          <>
            {' · '}
            <Tag kind="neutral">{visibilityLabel[selection.visibility]}</Tag>
          </>
        )}
      </p>
      {selection.preview.length > 0 && (
        <p className={styles.meta}>Avec : {selection.preview.map((s) => s.title).join(', ')}</p>
      )}
    </article>
  );
}

/** Étagères des membres (Explorer, profil) : sélections publiques, non vides. */
export function PublicShelves({ handle, title }: { handle?: string; title: string }) {
  const selections = usePublicSelections(handle);
  const items = selections.data?.items ?? [];
  if (!items.length) return null;
  return (
    <section aria-labelledby="etageres" className={styles.shelf}>
      <h2 id="etageres" className={styles.sectionTitle}>
        {title}
      </h2>
      <ul className={styles.grid} aria-label={title}>
        {items.map((selection) => (
          <li key={selection.id}>
            <SelectionCard selection={selection} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Mes sélections (dans Mes lectures) : la liste et la création d'une sélection. */
export function MySelections() {
  const selections = useMySelections();
  const items = selections.data?.items ?? [];
  return (
    <section aria-labelledby="mes-selections" className={styles.shelf}>
      <h2 id="mes-selections" className={styles.sectionTitle}>
        Mes sélections
      </h2>
      <p className={styles.meta}>
        Des étagères à votre goût, privées ou publiques. Une histoire peut aller dans plusieurs.
      </p>
      {selections.isPending ? (
        <Loading label="Chargement de vos sélections…" />
      ) : items.length ? (
        <ul className={styles.grid} aria-label="Mes sélections">
          {items.map((selection) => (
            <li key={selection.id}>
              <SelectionCard selection={selection} showVisibility />
            </li>
          ))}
        </ul>
      ) : (
        <p>Pas encore de sélection.</p>
      )}
      <NewSelectionForm />
    </section>
  );
}

/** Nouvelle sélection (privée) ; `onCreated` : par exemple, y ajouter une histoire. */
function NewSelectionForm({
  onCreated,
  submitLabel = 'Créer la sélection',
}: {
  onCreated?: (selection: Selection) => void;
  submitLabel?: string;
}) {
  const { create } = useSelectionActions();
  const [error, setError] = useState<string>();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = NewSelection.safeParse({ title: new FormData(form).get('title') });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      requestAnimationFrame(() =>
        form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    setError(undefined);
    create.mutate(parsed.data, {
      onSuccess: (selection) => {
        form.reset();
        onCreated?.(selection);
      },
      onError: (e) =>
        setError(e instanceof ApiError ? (e.fieldError('title') ?? e.message) : e.message),
    });
  };
  return (
    <form className={styles.inlineForm} onSubmit={submit} noValidate>
      <TextField label="Nouvelle sélection" name="title" maxLength={100} error={error} />
      <div>
        <Button type="submit" variant="secondary" pending={create.isPending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

/** Fiche d'une histoire : la ranger dans une ou plusieurs de ses sélections. */
export function AddToSelection({ storyId }: { storyId: string }) {
  const [open, setOpen] = useState(false);
  const selections = useMySelections(storyId, open);
  const { toggleStory } = useSelectionActions();
  const items = selections.data?.items ?? [];
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Ajouter à une sélection"
      description="Cochez les sélections où ranger cette histoire."
      trigger={
        <Button variant="secondary" size="small">
          Ajouter à une sélection
        </Button>
      }
    >
      <div className={styles.settings}>
        {selections.isPending ? (
          <Loading label="Chargement de vos sélections…" />
        ) : items.length ? (
          <fieldset className={styles.limits}>
            <legend>Mes sélections</legend>
            {items.map((selection) => (
              <Checkbox
                key={selection.id}
                label={selection.title}
                checked={selection.contains ?? false}
                onChange={(e) =>
                  toggleStory.mutate({ id: selection.id, storyId, add: e.target.checked })
                }
              />
            ))}
          </fieldset>
        ) : (
          <p>Pas encore de sélection : créez la première.</p>
        )}
        {toggleStory.isError && (
          <Alert tone="danger" live title="La sélection n’a pas été modifiée.">
            <p>{toggleStory.error.message}</p>
          </Alert>
        )}
        <NewSelectionForm
          submitLabel="Créer et y ajouter l’histoire"
          onCreated={(selection) => toggleStory.mutate({ id: selection.id, storyId, add: true })}
        />
      </div>
    </Dialog>
  );
}

/** Page d'une sélection : partageable si elle est publique ; modifiable par la personne. */
export function SelectionPage() {
  const { id = '' } = useParams();
  const selection = useSelection(id);
  usePageTitle(selection.data?.title ?? 'Sélection');
  if (selection.isPending) return <Loading label="Chargement de la sélection…" />;
  if (selection.isError) {
    const missing =
      selection.error instanceof ApiError && [400, 404].includes(selection.error.status);
    return (
      <Page
        title={missing ? 'Sélection introuvable' : 'Chargement impossible'}
        width="narrow"
        lead={missing ? 'Elle n’existe pas, ou n’est pas publique.' : undefined}
      >
        {!missing && (
          <Alert tone="danger" live title="Cette sélection n’a pas pu être chargée.">
            <p>{selection.error.message}</p>
          </Alert>
        )}
      </Page>
    );
  }
  const s = selection.data;
  return (
    <Page title={s.title} lead={s.description || undefined}>
      <p className={styles.meta}>
        Sélection de <AuthorLink author={s.owner} /> · {plural(s.storyCount, 'histoire')}
        {s.mine && (
          <>
            {' · '}
            <Tag kind="neutral">{visibilityLabel[s.visibility]}</Tag>
          </>
        )}
      </p>
      {s.mine && <EditSelection selection={s} />}
      <LimitedStories selection={s} />
    </Page>
  );
}

/** Histoires de la sélection, avec Mes limites appliquées (#81) ; ce qui est masqué reste consultable. */
function LimitedStories({ selection: s }: { selection: Selection }) {
  const { limits } = useLimits();
  const [revealed, setRevealed] = useState(false);
  const masked = s.stories.filter((story) => limitReasons(story, limits).length);
  const shown = revealed ? s.stories : s.stories.filter((story) => !masked.includes(story));
  return (
    <>
      <div className={styles.hiddenNote}>
        <output className={styles.meta}>
          {revealed
            ? 'Les histoires masquées par vos limites sont affichées pour cette fois.'
            : masked.length > 0 &&
              `${plural(masked.length, 'histoire masquée', 'histoires masquées')} par vos limites.`}
        </output>
        {masked.length > 0 && (
          <Button variant="ghost" size="small" onClick={() => setRevealed(!revealed)}>
            {revealed ? 'Les masquer de nouveau' : 'Les afficher pour cette fois'}
          </Button>
        )}
      </div>
      {shown.length ? (
        <ul className={styles.grid} aria-label={`Histoires de la sélection ${s.title}`}>
          {shown.map((story) => (
            <li key={story.id} className={styles.libraryItem}>
              <StoryCard
                story={story}
                hiddenBecause={revealed ? limitReasons(story, limits) : []}
              />
              {s.mine && (
                <RemoveFromSelection selectionId={s.id} storyId={story.id} title={story.title} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {s.stories.length
            ? 'Toutes ses histoires sont masquées par vos limites.'
            : 'Aucune histoire pour l’instant.'}
          {s.mine && !s.stories.length && <> Ajoutez-en depuis la fiche d’une histoire.</>}
        </p>
      )}
    </>
  );
}

function RemoveFromSelection({
  selectionId,
  storyId,
  title,
}: {
  selectionId: string;
  storyId: string;
  title: string;
}) {
  const { toggleStory } = useSelectionActions();
  return (
    <div>
      <Button
        variant="secondary"
        size="small"
        pending={toggleStory.isPending}
        onClick={() => toggleStory.mutate({ id: selectionId, storyId, add: false })}
      >
        Retirer <span className="visually-hidden">« {title} » de la sélection</span>
      </Button>
    </div>
  );
}

/** Modifier sa sélection : titre, présentation, visibilité ; la supprimer. */
function EditSelection({ selection }: { selection: Selection }) {
  const { update, remove } = useSelectionActions();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(undefined);
    update.mutate(
      {
        id: selection.id,
        title: String(form.get('title') ?? '').trim(),
        description: String(form.get('description') ?? '').trim(),
        visibility: form.get('visibility') as SelectionVisibility,
      },
      { onError: (e) => setError(e.message) },
    );
  };
  return (
    <details className={styles.limitsDetails}>
      <summary>Modifier la sélection</summary>
      <form className={styles.inlineForm} onSubmit={submit} noValidate key={selection.updatedAt}>
        <TextField label="Titre" name="title" maxLength={100} defaultValue={selection.title} />
        <TextArea
          label="Présentation"
          name="description"
          maxLength={1000}
          defaultValue={selection.description}
          hint="Facultative : ce qui relie ces histoires."
        />
        <RadioGroup
          label="Visibilité"
          name="visibility"
          choices={VISIBILITIES}
          defaultChoice={selection.visibility}
        />
        {selection.visibility === 'public' && (
          <p className={styles.meta}>
            Lien à partager :{' '}
            <Link
              to={`/selections/${selection.id}`}
            >{`${window.location.origin}/selections/${selection.id}`}</Link>
          </p>
        )}
        {error && (
          <Alert tone="danger" live title="La sélection n’a pas été enregistrée.">
            <p>{error}</p>
          </Alert>
        )}
        {update.isSuccess && <Alert tone="success" live title="Sélection enregistrée." />}
        <div className={styles.libraryActions}>
          <Button type="submit" variant="primary" pending={update.isPending}>
            Enregistrer
          </Button>
          <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
            Supprimer la sélection
          </Button>
        </div>
      </form>
      <Dialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Supprimer cette sélection ?"
        description="Les histoires ne sont pas supprimées, seulement la sélection."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              pending={remove.isPending}
              onClick={() =>
                remove.mutate(selection.id, { onSuccess: () => void navigate('/mes-lectures') })
              }
            >
              Supprimer
            </Button>
          </>
        }
      >
        <p>« {selection.title} » disparaîtra, ainsi que son lien.</p>
      </Dialog>
    </details>
  );
}
