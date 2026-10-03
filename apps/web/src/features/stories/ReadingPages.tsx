import type { StorySummary } from '@plumiotheca/contracts';
import type { ChapterDocument } from '@plumiotheca/editor-schema';
import { Link, useParams } from 'react-router';
import { ApiError } from '../../shared/api/client';
import { ButtonLink } from '../../shared/ui/Button';
import { Alert, Loading, Tag } from '../../shared/ui/Feedback';
import { Page, usePageTitle } from '../../shared/ui/Page';
import { useChapter, usePublicStories, useStory } from './api';
import { ChapterContent } from './ChapterContent';
import {
  completionLabel,
  coverColors,
  formatDate,
  formatNumber,
  plural,
  ratingLabel,
  warningsText,
} from './labels';
import styles from './Reading.module.css';

/** Erreur de chargement : « introuvable » ou message de l'API. */
function LoadError({ error, what }: { error: Error; what: string }) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <Page
        title={`${what} introuvable`}
        width="narrow"
        lead="Elle a peut-être été retirée ou dépubliée."
      >
        <div>
          <ButtonLink to="/" variant="primary">
            Revenir aux histoires
          </ButtonLink>
        </div>
      </Page>
    );
  }
  return (
    <Page title="Chargement impossible" width="narrow">
      <Alert tone="danger" live title={`${what} n’a pas pu être chargée.`}>
        <p>{error.message}</p>
      </Alert>
    </Page>
  );
}

function StoryTags({ story }: { story: StorySummary }) {
  const warnings = warningsText(story.majorWarnings);
  return (
    <ul className={styles.tags} aria-label="Classement, avertissements et tags">
      {story.rating && (
        <li>
          <Tag kind="rating">{ratingLabel[story.rating]}</Tag>
        </li>
      )}
      {warnings && story.majorWarnings?.length ? (
        <li>
          <Tag kind="warning">Avertissements : {warnings}</Tag>
        </li>
      ) : null}
      {story.tags.map((tag) => (
        <li key={tag}>
          <Tag>{tag}</Tag>
        </li>
      ))}
    </ul>
  );
}

function StoryCard({ story }: { story: StorySummary }) {
  return (
    <article className={styles.card}>
      <div className={styles.spine} style={coverColors(story.id)} aria-hidden="true">
        {story.title}
      </div>
      <div className={styles.cardBody}>
        <h2 className={styles.cardTitle}>
          <Link to={`/histoires/${story.id}`}>{story.title}</Link>
        </h2>
        <p className={styles.meta}>
          par {story.author.displayName ?? `@${story.author.handle}`} ·{' '}
          {plural(story.chapterCount, 'chapitre')} · {completionLabel[story.completion]}
        </p>
        {story.summary && <p className={styles.summary}>{story.summary}</p>}
        <StoryTags story={story} />
      </div>
    </article>
  );
}

/** Explorer : les dernières histoires publiées (sélections et recherche : #21, #82). */
export function ExplorePage() {
  const stories = usePublicStories();
  return (
    <Page
      title="Explorer"
      lead="Les dernières histoires publiées. Bientôt : des sélections composées par des lectrices et lecteurs, des autrices et auteurs, et l’équipe. Pas de fil choisi par un algorithme."
    >
      {stories.isPending && <Loading label="Chargement des histoires…" />}
      {stories.isError && (
        <Alert tone="danger" live title="Les histoires n’ont pas pu être chargées.">
          <p>{stories.error.message}</p>
        </Alert>
      )}
      {stories.data &&
        (stories.data.items.length ? (
          <ul className={styles.grid} aria-label="Dernières histoires publiées">
            {stories.data.items.map((story) => (
              <li key={story.id}>
                <StoryCard story={story} />
              </li>
            ))}
          </ul>
        ) : (
          <div className={styles.empty}>
            <p>Aucune histoire publiée pour l’instant. Et si vous écriviez la première ?</p>
            <ButtonLink to="/ecrire" variant="primary">
              Écrire une histoire
            </ButtonLink>
          </div>
        ))}
    </Page>
  );
}

/** Fiche d'une histoire : couverture, présentation, sommaire. */
export function StoryPage() {
  const { storyId = '' } = useParams();
  const story = useStory(storyId);
  usePageTitle(story.data?.title ?? 'Histoire');

  if (story.isPending) return <Loading label="Chargement de l’histoire…" />;
  if (story.isError) return <LoadError error={story.error} what="Cette histoire" />;
  const s = story.data;
  const published = s.chapters.filter((c) => c.status === 'published');
  const first = published[0];

  return (
    <div className={styles.storyPage}>
      <div className={styles.story}>
        <div className={styles.side}>
          <div className={styles.cover} style={coverColors(s.id)} aria-hidden="true">
            {s.title}
          </div>
          {first && (
            <ButtonLink to={`/histoires/${s.id}/chapitres/${first.id}`} variant="primary" wide>
              Commencer la lecture
            </ButtonLink>
          )}
        </div>

        <div className={styles.main}>
          <div>
            <h1 className={styles.storyTitle}>{s.title}</h1>
            <p className={styles.byline}>
              par {s.author.displayName ?? `@${s.author.handle}`} · {completionLabel[s.completion]}
              {s.publishedAt && <> · publiée le {formatDate(s.publishedAt)}</>}
            </p>
          </div>
          <dl className={styles.stats}>
            <div>
              <dt>chapitres</dt>
              <dd>{formatNumber(published.length)}</dd>
            </div>
            <div>
              <dt>mots</dt>
              <dd>{formatNumber(s.wordCount)}</dd>
            </div>
          </dl>
          <StoryTags story={s} />
          {s.majorWarnings && !s.majorWarnings.length && (
            <p className={styles.meta}>Aucun avertissement majeur.</p>
          )}
          {s.summary && (
            <section aria-labelledby="resume">
              <h2 id="resume" className={styles.sectionTitle}>
                Résumé
              </h2>
              <p>{s.summary}</p>
            </section>
          )}
        </div>

        <nav className={styles.toc} aria-labelledby="sommaire">
          <h2 id="sommaire">Sommaire</h2>
          {published.length ? (
            <ol>
              {published.map((chapter) => (
                <li key={chapter.id}>
                  <Link to={`/histoires/${s.id}/chapitres/${chapter.id}`}>
                    <span className={styles.tocNumber}>{chapter.number}</span>
                    <span className={styles.tocTitle}>
                      {chapter.title || `Chapitre ${chapter.number}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.meta}>Aucun chapitre publié.</p>
          )}
        </nav>
      </div>
    </div>
  );
}

/** Lecteur : un chapitre publié, en typographie de lecture, avec chapitre précédent / suivant. */
export function ReaderPage() {
  const { storyId = '', chapterId = '' } = useParams();
  const story = useStory(storyId);
  const chapter = useChapter(storyId, chapterId);
  const title = chapter.data
    ? `${chapter.data.title || `Chapitre ${chapter.data.number}`} — ${story.data?.title ?? ''}`
    : 'Chapitre';
  usePageTitle(title);

  if (chapter.isPending) return <Loading label="Chargement du chapitre…" />;
  if (chapter.isError) return <LoadError error={chapter.error} what="Ce chapitre" />;
  const c = chapter.data;

  return (
    <article className={styles.reader}>
      <p className={styles.crumb}>
        <Link to={`/histoires/${storyId}`}>{story.data?.title ?? 'Retour à l’histoire'}</Link>
        {' · '}
        {plural(c.readingMinutes, 'minute')} de lecture
      </p>
      <div>
        <p className={styles.eyebrow}>Chapitre {c.number}</p>
        <h1 className={styles.chapterTitle}>{c.title || `Chapitre ${c.number}`}</h1>
      </div>
      <ChapterContent doc={c.content as ChapterDocument} />
      <nav className={styles.chapterNav} aria-label="Chapitres">
        {c.previousId && (
          <ButtonLink to={`/histoires/${storyId}/chapitres/${c.previousId}`} variant="secondary">
            ← Chapitre précédent
          </ButtonLink>
        )}
        {c.nextId ? (
          <ButtonLink to={`/histoires/${storyId}/chapitres/${c.nextId}`} variant="primary">
            Chapitre suivant →
          </ButtonLink>
        ) : (
          <ButtonLink to={`/histoires/${storyId}`} variant="secondary">
            Retour au sommaire
          </ButtonLink>
        )}
      </nav>
    </article>
  );
}
