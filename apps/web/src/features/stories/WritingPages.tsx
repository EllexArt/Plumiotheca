import { MajorWarning, NewStory, Rating } from '@plumiotheca/contracts';
import type { ChapterDocument } from '@plumiotheca/editor-schema';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../shared/api/client';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { Alert, Loading, Tag } from '../../shared/ui/Feedback';
import { Checkbox, RadioGroup, TextArea, TextField } from '../../shared/ui/Field';
import { Page } from '../../shared/ui/Page';
import { useDraft, useMyStories, useStory, useWriterActions } from './api';
import { formatNumber, plural, ratingHint, ratingLabel, warningLabel } from './labels';
import { documentToText, textToDocument } from './plainDocument';
import styles from './Writing.module.css';

const statusLabel = { draft: 'brouillon', published: 'publiée', archived: 'archivée' } as const;

/** Atelier : mes histoires, brouillons compris. */
export function WritePage() {
  const stories = useMyStories();
  return (
    <Page title="Écrire" lead="Votre atelier : vos histoires, publiées ou en brouillon.">
      <div>
        <ButtonLink to="/ecrire/nouvelle" variant="primary">
          Nouvelle histoire
        </ButtonLink>
      </div>
      {stories.isPending && <Loading label="Chargement de vos histoires…" />}
      {stories.isError && (
        <Alert tone="danger" live title="Vos histoires n’ont pas pu être chargées.">
          <p>{stories.error.message}</p>
        </Alert>
      )}
      {stories.data &&
        (stories.data.length ? (
          <ul className={styles.list} aria-label="Mes histoires">
            {stories.data.map((story) => (
              <li key={story.id} className={styles.row}>
                <div>
                  <h2 className={styles.rowTitle}>
                    <Link to={`/ecrire/histoires/${story.id}`}>{story.title}</Link>
                  </h2>
                  <p className={styles.meta}>
                    {plural(story.chapterCount, 'chapitre publié', 'chapitres publiés')} ·{' '}
                    {plural(story.wordCount, 'mot')}
                  </p>
                </div>
                <Tag kind={story.status === 'published' ? 'rating' : 'neutral'}>
                  {statusLabel[story.status]}
                </Tag>
              </li>
            ))}
          </ul>
        ) : (
          <p>Vous n’avez pas encore d’histoire. Lancez-vous !</p>
        ))}
    </Page>
  );
}

type Errors = Partial<Record<'title' | 'summary' | 'rating' | 'majorWarnings' | 'tags', string>>;

const WARNINGS = MajorWarning.options.filter((w) => w !== 'unspecified');

/** Nouvelle histoire : titre, résumé, classement, avertissements, tags. */
export function NewStoryPage() {
  const navigate = useNavigate();
  const { createStory } = useWriterActions();
  const [errors, setErrors] = useState<Errors>({});

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (createStory.isPending) return;
    const form = new FormData(event.currentTarget);
    const unspecified = form.get('nonPrecise') === 'on';
    const parsed = NewStory.safeParse({
      title: form.get('title'),
      summary: form.get('summary'),
      language: 'fr',
      rating: form.get('rating') || null,
      majorWarnings: unspecified ? ['unspecified'] : form.getAll('warnings'),
      tags: String(form.get('tags') ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]) as keyof Errors;
        next[key] ??= issue.message;
      }
      setErrors(next);
      // Focus sur le premier champ en erreur, une fois les messages affichés.
      const formElement = event.currentTarget;
      requestAnimationFrame(() =>
        formElement
          .querySelector<HTMLElement>('[aria-invalid="true"], [aria-describedby*="erreur"]')
          ?.focus(),
      );
      return;
    }
    setErrors({});
    createStory.mutate(parsed.data, {
      onSuccess: (story) => void navigate(`/ecrire/histoires/${story.id}`, { replace: true }),
    });
  };

  return (
    <Page
      title="Nouvelle histoire"
      width="narrow"
      lead="Tout se modifie ensuite. L’histoire reste un brouillon, visible de vous seule ou seul, jusqu’à sa publication."
    >
      <form className={styles.form} onSubmit={submit} noValidate>
        <TextField label="Titre" name="title" required maxLength={200} error={errors.title} />
        <TextArea
          label="Résumé"
          name="summary"
          hint="Quelques lignes pour donner envie, sans tout dévoiler."
          maxLength={4000}
          error={errors.summary}
        />
        <RadioGroup
          label="Classement"
          name="rating"
          hint="Obligatoire pour publier ; un classement honnête est une règle de la charte (4.1)."
          error={errors.rating}
          choices={Rating.options.map((r) => ({
            value: r,
            label: ratingLabel[r],
            hint: ratingHint[r],
          }))}
        />
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Avertissements majeurs</legend>
          <p className={styles.meta}>
            Cochez ceux qui s’appliquent ; aucune case cochée : aucun avertissement majeur.
          </p>
          {WARNINGS.map((w) => (
            <Checkbox key={w} name="warnings" value={w} label={warningLabel[w]} />
          ))}
          <Checkbox
            name="nonPrecise"
            label="Je préfère ne pas préciser"
            hint="Les personnes qui lisent seront prévenues que des avertissements ne sont pas précisés."
            error={errors.majorWarnings}
          />
        </fieldset>
        <TextField
          label="Tags"
          name="tags"
          hint="Séparés par des virgules : fantasy, slow burn, found family…"
          error={errors.tags}
        />
        {createStory.isError && (
          <Alert tone="danger" live title="L’histoire n’a pas pu être créée.">
            <p>{createStory.error.message}</p>
          </Alert>
        )}
        <div>
          <Button type="submit" variant="primary" pending={createStory.isPending}>
            {createStory.isPending ? 'Création…' : 'Créer l’histoire'}
          </Button>
        </div>
      </form>
    </Page>
  );
}

/** Gestion d'une histoire : chapitres, publication. */
export function ManageStoryPage() {
  const { storyId = '' } = useParams();
  const navigate = useNavigate();
  const story = useStory(storyId);
  const actions = useWriterActions(storyId);
  const [chapterTitle, setChapterTitle] = useState('');

  if (story.isPending) return <Loading label="Chargement de l’histoire…" />;
  if (story.isError) {
    return (
      <Page title="Histoire introuvable" width="narrow">
        <Alert tone="danger" title="Cette histoire n’a pas pu être chargée.">
          <p>{story.error.message}</p>
        </Alert>
      </Page>
    );
  }
  const s = story.data;
  const publishedChapters = s.chapters.filter((c) => c.status === 'published').length;

  const addChapter = (event: FormEvent) => {
    event.preventDefault();
    if (actions.createChapter.isPending) return;
    actions.createChapter.mutate(chapterTitle.trim(), {
      onSuccess: (chapter) => void navigate(`/ecrire/histoires/${s.id}/chapitres/${chapter.id}`),
    });
  };

  return (
    <Page
      title={s.title}
      documentTitle={`${s.title} (atelier)`}
      lead={`Histoire ${statusLabel[s.status]} · ${s.rating ? ratingLabel[s.rating] : 'classement à choisir'} · ${plural(s.wordCount, 'mot publié', 'mots publiés')}`}
    >
      <div className={styles.actions}>
        {s.status === 'published' ? (
          <ButtonLink to={`/histoires/${s.id}`} variant="secondary">
            Voir comme une lectrice ou un lecteur
          </ButtonLink>
        ) : (
          <Button
            variant="primary"
            pending={actions.publishStory.isPending}
            onClick={() => actions.publishStory.mutate()}
          >
            Publier l’histoire
          </Button>
        )}
        <ButtonLink to="/ecrire" variant="ghost">
          Retour à l’atelier
        </ButtonLink>
      </div>
      {s.status !== 'published' && (
        <p className={styles.meta}>
          Pour publier : un classement, les avertissements, et au moins un chapitre publié (
          {publishedChapters ? 'c’est fait' : 'pas encore'}).
        </p>
      )}
      {actions.publishStory.isError && (
        <Alert tone="danger" live title="L’histoire n’a pas pu être publiée.">
          <p>{actions.publishStory.error.message}</p>
        </Alert>
      )}
      {actions.publishStory.isSuccess && (
        <Alert tone="success" live title="Votre histoire est publiée.">
          <p>Elle apparaît maintenant dans Explorer.</p>
        </Alert>
      )}

      <section className={styles.section} aria-labelledby="chapitres">
        <h2 id="chapitres">Chapitres</h2>
        {s.chapters.length ? (
          <ol className={styles.list}>
            {s.chapters.map((chapter, i) => (
              <li key={chapter.id} className={styles.row}>
                <div>
                  <h3 className={styles.rowTitle}>
                    <Link to={`/ecrire/histoires/${s.id}/chapitres/${chapter.id}`}>
                      {i + 1}. {chapter.title || 'Sans titre'}
                    </Link>
                  </h3>
                  <p className={styles.meta}>{plural(chapter.wordCount, 'mot')}</p>
                </div>
                <Tag kind={chapter.status === 'published' ? 'rating' : 'neutral'}>
                  {chapter.status === 'published' ? 'publié' : 'brouillon'}
                </Tag>
              </li>
            ))}
          </ol>
        ) : (
          <p>Aucun chapitre pour l’instant.</p>
        )}
        <form className={styles.inline} onSubmit={addChapter}>
          <TextField
            label="Titre du nouveau chapitre"
            value={chapterTitle}
            onChange={(e) => setChapterTitle(e.target.value)}
            maxLength={200}
          />
          <Button type="submit" variant="secondary" pending={actions.createChapter.isPending}>
            Ajouter un chapitre
          </Button>
        </form>
        {actions.createChapter.isError && (
          <Alert tone="danger" live title="Le chapitre n’a pas pu être ajouté.">
            <p>{actions.createChapter.error.message}</p>
          </Alert>
        )}
      </section>
    </Page>
  );
}

/**
 * Éditeur simple d'un chapitre (l'éditeur riche TipTap arrive avec #25) : sauvegarde
 * automatique deux secondes après la dernière frappe, version contrôlée par l'API.
 */
export function ChapterEditorPage() {
  const { storyId = '', chapterId = '' } = useParams();
  const draft = useDraft(storyId, chapterId);
  const story = useStory(storyId);
  const actions = useWriterActions(storyId);
  const navigate = useNavigate();

  const [text, setText] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [words, setWords] = useState(0);
  const [status, setStatus] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const timer = useRef<number>(undefined);

  // Première lecture du brouillon : le texte devient celui de l'éditeur.
  if (draft.data && text === null) {
    setText(documentToText(draft.data.draft as ChapterDocument));
    setTitle(draft.data.title);
    setVersion(draft.data.draftVersion);
    setWords(draft.data.wordCount);
  }

  const save = async (): Promise<boolean> => {
    if (text === null) return false;
    try {
      const saved = await actions.saveDraft.mutateAsync({
        chapterId,
        draft: textToDocument(text),
        version,
      });
      setVersion(saved.draftVersion);
      setWords(saved.wordCount);
      setDirty(false);
      setStatus(
        `Enregistré à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
      );
      return true;
    } catch (error) {
      setStatus(
        error instanceof ApiError && error.status === 409
          ? 'Ce chapitre a été modifié ailleurs (autre onglet ?). Rechargez la page avant de continuer.'
          : 'Enregistrement impossible pour l’instant ; votre texte est toujours là.',
      );
      return false;
    }
  };

  // Sauvegarde automatique.
  useEffect(() => {
    if (!dirty) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), 2000);
    return () => window.clearTimeout(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, dirty]);

  // Fermeture de l'onglet avec un texte non enregistré : le navigateur prévient.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (draft.isPending || text === null) return <Loading label="Chargement du chapitre…" />;
  if (draft.isError) {
    return (
      <Page title="Chapitre introuvable" width="narrow">
        <Alert tone="danger" title="Ce chapitre n’a pas pu être chargé.">
          <p>{draft.error.message}</p>
        </Alert>
      </Page>
    );
  }

  const publish = async () => {
    if (actions.publishChapter.isPending) return;
    if (dirty && !(await save())) return;
    actions.publishChapter.mutate(chapterId, {
      onSuccess: () => void navigate(`/ecrire/histoires/${storyId}`),
    });
  };

  return (
    <Page
      title={title || 'Chapitre sans titre'}
      documentTitle={`${title || 'Chapitre'} (écriture)`}
      lead={
        story.data
          ? `${story.data.title} · ${draft.data.status === 'published' ? 'publié (vous modifiez le brouillon)' : 'brouillon'}`
          : undefined
      }
    >
      <div className={styles.toolbar}>
        <output className={styles.status}>
          {dirty ? 'Modifications non enregistrées…' : status}
        </output>
        <span className={styles.meta}>{formatNumber(words)} mots enregistrés</span>
        <Button
          variant="secondary"
          pending={actions.saveDraft.isPending}
          onClick={() => void save()}
        >
          Enregistrer
        </Button>
        <Button
          variant="primary"
          pending={actions.publishChapter.isPending}
          onClick={() => void publish()}
        >
          {draft.data.status === 'published'
            ? 'Publier la nouvelle version'
            : 'Publier le chapitre'}
        </Button>
      </div>
      {actions.publishChapter.isError && (
        <Alert tone="danger" live title="Le chapitre n’a pas pu être publié.">
          <p>{actions.publishChapter.error.message}</p>
        </Alert>
      )}
      <TextField
        label="Titre du chapitre"
        value={title ?? ''}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => actions.renameChapter.mutate({ chapterId, title: (title ?? '').trim() })}
      />
      <TextArea
        label="Texte"
        hint="Une ligne vide entre deux paragraphes ; « *** » seul sur une ligne pour un changement de scène. Enregistrement automatique."
        className={styles.editor}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
      />
      <p>
        <Link to={`/ecrire/histoires/${storyId}`}>Retour à l’histoire</Link>
      </p>
    </Page>
  );
}
