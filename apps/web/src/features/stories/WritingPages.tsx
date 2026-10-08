import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { Alert, Loading, Tag } from '../../shared/ui/Feedback';
import { TextField } from '../../shared/ui/Field';
import { Page } from '../../shared/ui/Page';
import { useMyStories, useStory, useWriterActions } from './api';
import { plural, ratingLabel } from './labels';
import { StoryForm } from './StoryForm';
import styles from './Writing.module.css';

const statusLabel = { draft: 'brouillon', published: 'publiée', archived: 'archivée' } as const;

/** Atelier : mes histoires, brouillons compris, par pages (« Voir plus »). */
export function WritePage() {
  const stories = useMyStories();
  const items = stories.data?.pages.flatMap((page) => page.items) ?? [];
  // Rang de la première histoire ajoutée par « Voir plus » : le focus y va une fois affichée.
  const focusFrom = useRef<number | null>(null);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const from = focusFrom.current;
    if (from === null || items.length <= from) return;
    list.current?.querySelectorAll<HTMLAnchorElement>('h2 a')[from]?.focus();
    focusFrom.current = null;
  }, [items.length]);
  // Chargement fini sans nouvelle histoire (échec, ou page vide) : plus de focus à déplacer,
  // sinon il sauterait plus tard, à un ajout sans rapport.
  const fetchingMore = stories.isFetchingNextPage;
  useEffect(() => {
    const from = focusFrom.current;
    if (!fetchingMore && from !== null && items.length <= from) focusFrom.current = null;
  }, [fetchingMore, items.length]);

  return (
    <Page title="Écrire" lead="Votre atelier : vos histoires, publiées ou en brouillon.">
      <div>
        <ButtonLink to="/ecrire/nouvelle" variant="primary">
          Nouvelle histoire
        </ButtonLink>
      </div>
      {stories.isPending && <Loading label="Chargement de vos histoires…" />}
      {/* Seule la première page en échec remplace la liste ; « Voir plus » en échec la garde. */}
      {stories.isError && !stories.data && (
        <Alert tone="danger" live title="Vos histoires n’ont pas pu être chargées.">
          <p>{stories.error.message}</p>
        </Alert>
      )}
      {stories.data &&
        (items.length ? (
          <ul className={styles.list} aria-label="Mes histoires" ref={list}>
            {items.map((story) => (
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
      {stories.isFetchNextPageError && (
        <Alert tone="danger" live title="Les histoires suivantes n’ont pas pu être chargées.">
          <p>{stories.error?.message} Vous pouvez réessayer avec le bouton ci-dessous.</p>
        </Alert>
      )}
      {stories.hasNextPage && (
        <div>
          <Button
            variant="secondary"
            pending={stories.isFetchingNextPage}
            onClick={() => {
              focusFrom.current = items.length;
              void stories.fetchNextPage();
            }}
          >
            {stories.isFetchingNextPage ? 'Chargement…' : 'Voir plus d’histoires'}
          </Button>
        </div>
      )}
    </Page>
  );
}

/** Nouvelle histoire : titre, résumé, classement, avertissements, tags. */
export function NewStoryPage() {
  const navigate = useNavigate();
  const { createStory } = useWriterActions();
  return (
    <Page
      title="Nouvelle histoire"
      width="narrow"
      lead="Tout se modifie ensuite. L’histoire reste un brouillon, visible de vous seule ou seul, jusqu’à sa publication."
    >
      <StoryForm
        submitLabel="Créer l’histoire"
        pendingLabel="Création…"
        pending={createStory.isPending}
        error={createStory.error?.message}
        onSubmit={(values) =>
          createStory.mutate(values, {
            onSuccess: (story) => void navigate(`/ecrire/histoires/${story.id}`, { replace: true }),
          })
        }
      />
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
          <ButtonLink to={`/ecrire/histoires/${s.id}/publier`} variant="primary">
            Publier l’histoire
          </ButtonLink>
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

      <details className={styles.details}>
        <summary>
          Modifier les informations (titre, résumé, classement, avertissements, tags)
        </summary>
        <StoryForm
          key={s.updatedAt}
          story={s}
          submitLabel="Enregistrer les informations"
          pendingLabel="Enregistrement…"
          pending={actions.updateStory.isPending}
          error={actions.updateStory.error?.message}
          onSubmit={(values) => actions.updateStory.mutate(values)}
        />
        {actions.updateStory.isSuccess && (
          <Alert tone="success" live title="Informations enregistrées." />
        )}
      </details>

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
