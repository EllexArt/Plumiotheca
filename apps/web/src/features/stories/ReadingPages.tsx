import type { StorySummary } from '@plumiotheca/contracts';
import { parseDocument } from '@plumiotheca/editor-schema';
import { useEffect, useRef, type ReactNode } from 'react';
import { useAuth } from 'react-oidc-context';
import { Link, useParams, useSearchParams } from 'react-router';
import { ApiError } from '../../shared/api/client';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { Alert, Loading, Tag } from '../../shared/ui/Feedback';
import { Page, usePageTitle } from '../../shared/ui/Page';
import { useChapter, usePublicStories, useStory, type StoryFilters } from './api';
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
import { lastChapter, rememberChapter } from './progress';
import styles from './Reading.module.css';
import { ReadingProgress } from './ReadingProgress';

const missing = {
  story: {
    title: 'Histoire introuvable',
    lead: 'Elle a peut-être été retirée ou dépubliée.',
    failed: 'Cette histoire n’a pas pu être chargée.',
  },
  chapter: {
    title: 'Chapitre introuvable',
    lead: 'Il a peut-être été retiré ou dépublié.',
    failed: 'Ce chapitre n’a pas pu être chargé.',
  },
};

/** Erreur de chargement : « introuvable » ou message de l'API. */
function LoadError({ error, what }: { error: Error; what: keyof typeof missing }) {
  const text = missing[what];
  if (error instanceof ApiError && error.status === 404) {
    return (
      <Page title={text.title} width="narrow" lead={text.lead}>
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
      <Alert tone="danger" live title={text.failed}>
        <p>{error.message}</p>
      </Alert>
    </Page>
  );
}

/** Nom de la personne qui a écrit, avec lien vers son profil public. */
function AuthorLink({ author }: { author: StorySummary['author'] }) {
  return (
    <Link to={`/profils/${encodeURIComponent(author.handle)}`}>
      {author.displayName ?? `@${author.handle}`}
    </Link>
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
          <Link to={`/?tag=${encodeURIComponent(tag)}`} className={styles.tagLink}>
            <span className="visually-hidden">Histoires avec le tag</span> {tag}
          </Link>
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
          par <AuthorLink author={story.author} /> · {plural(story.chapterCount, 'chapitre')} ·{' '}
          {completionLabel[story.completion]}
        </p>
        {story.summary && <p className={styles.summary}>{story.summary}</p>}
        <StoryTags story={story} />
      </div>
    </article>
  );
}

/** Liste d'histoires paginée (« Voir plus ») ; le focus va à la première histoire ajoutée. */
export function StoryList({
  filters,
  label,
  empty = null,
}: {
  filters: StoryFilters;
  label: string;
  /** Affiché quand il n'y a aucune histoire. */
  empty?: ReactNode;
}) {
  const stories = usePublicStories(filters);
  // Rang de la première histoire ajoutée par « Voir plus » (focus une fois affichée).
  const focusFrom = useRef<number | null>(null);
  const list = useRef<HTMLUListElement>(null);
  const items = stories.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    const from = focusFrom.current;
    if (from === null || items.length <= from) return;
    list.current?.querySelectorAll<HTMLAnchorElement>('h2 a')[from]?.focus();
    focusFrom.current = null;
  }, [items.length]);
  // Autres filtres ou page suivante en échec : plus de focus à déplacer.
  useEffect(() => {
    focusFrom.current = null;
  }, [filters.tag, filters.pseudonyme, stories.isFetchNextPageError]);

  if (stories.isPending) return <Loading label="Chargement des histoires…" />;
  // Seule la première page en échec remplace la liste ; « Voir plus » en échec la garde.
  if (stories.isError && !stories.data) {
    return (
      <Alert tone="danger" live title="Les histoires n’ont pas pu être chargées.">
        <p>{stories.error.message}</p>
      </Alert>
    );
  }
  if (!items.length) return <>{empty}</>;
  return (
    <>
      <ul className={styles.grid} aria-label={label} ref={list}>
        {items.map((story) => (
          <li key={story.id}>
            <StoryCard story={story} />
          </li>
        ))}
      </ul>
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
    </>
  );
}

/** Explorer (#21) : les dernières histoires publiées, filtrables par tag. */
export function ExplorePage() {
  const [params] = useSearchParams();
  const tag = params.get('tag')?.trim() || undefined;
  const stories = usePublicStories({ tag });
  const empty = stories.isSuccess && !stories.data.pages[0]?.items.length;
  return (
    <Page
      title={tag ? `Histoires avec le tag « ${tag} »` : 'Explorer'}
      lead={
        tag
          ? undefined
          : 'Les dernières histoires publiées. Bientôt : des sélections composées par des lectrices et lecteurs, des autrices et auteurs, et l’équipe. Pas de fil choisi par un algorithme.'
      }
    >
      {tag && (
        <p>
          <Link to="/">Voir toutes les histoires</Link>
        </p>
      )}
      <StoryList
        filters={{ tag }}
        label={tag ? `Histoires avec le tag ${tag}` : 'Dernières histoires publiées'}
      />
      {empty && (
        <div className={styles.empty}>
          {tag ? (
            <p>Aucune histoire publiée avec ce tag pour l’instant.</p>
          ) : (
            <>
              <p>Aucune histoire publiée pour l’instant. Et si vous écriviez la première ?</p>
              <ButtonLink to="/ecrire" variant="primary">
                Écrire une histoire
              </ButtonLink>
            </>
          )}
        </div>
      )}
    </Page>
  );
}

/** Fiche d'une histoire : couverture, présentation, sommaire. */
export function StoryPage() {
  const { storyId = '' } = useParams();
  const story = useStory(storyId);
  const auth = useAuth();
  usePageTitle(story.data?.title ?? 'Histoire');

  if (story.isPending) return <Loading label="Chargement de l’histoire…" />;
  if (story.isError) return <LoadError error={story.error} what="story" />;
  const s = story.data;
  const published = s.chapters.filter((c) => c.status === 'published');
  const first = published[0];
  // Dernier chapitre ouvert sur cet appareil (comptes connectés), s'il est toujours publié.
  const lastId = auth.isAuthenticated ? lastChapter(s.id) : null;
  const resumeAt = published.findIndex((c) => c.id === lastId);

  return (
    <div className={styles.storyPage}>
      <div className={styles.story}>
        <div className={styles.side}>
          <div className={styles.cover} style={coverColors(s.id)} aria-hidden="true">
            {s.title}
          </div>
          {resumeAt >= 0 ? (
            <ButtonLink
              to={`/histoires/${s.id}/chapitres/${published[resumeAt]!.id}`}
              variant="primary"
              wide
            >
              Reprendre au chapitre {resumeAt + 1}
            </ButtonLink>
          ) : (
            first && (
              <ButtonLink to={`/histoires/${s.id}/chapitres/${first.id}`} variant="primary" wide>
                Commencer la lecture
              </ButtonLink>
            )
          )}
        </div>

        <div className={styles.main}>
          <div>
            <h1 className={styles.storyTitle}>{s.title}</h1>
            <p className={styles.byline}>
              par <AuthorLink author={s.author} /> · {completionLabel[s.completion]}
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
              {published.map((chapter, i) => (
                <li key={chapter.id}>
                  <Link to={`/histoires/${s.id}/chapitres/${chapter.id}`}>
                    <span className="visually-hidden">Chapitre</span>{' '}
                    <span className={styles.tocNumber}>{i + 1}</span>{' '}
                    <span className={styles.tocTitle}>{chapter.title || `Chapitre ${i + 1}`}</span>
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
  const article = useRef<HTMLElement>(null);
  const opened = chapter.isSuccess;
  const signedIn = useAuth().isAuthenticated;
  useEffect(() => {
    if (opened && signedIn) rememberChapter(storyId, chapterId);
  }, [opened, signedIn, storyId, chapterId]);
  const title = chapter.data
    ? `${chapter.data.title || `Chapitre ${chapter.data.number}`} — ${story.data?.title ?? ''}`
    : 'Chapitre';
  usePageTitle(title);

  if (chapter.isPending) return <Loading label="Chargement du chapitre…" />;
  if (chapter.isError) return <LoadError error={chapter.error} what="chapter" />;
  const c = chapter.data;

  return (
    <article className={styles.reader} ref={article}>
      <ReadingProgress target={article} />
      <p className={styles.crumb}>
        <Link to={`/histoires/${storyId}`}>{story.data?.title ?? 'Retour à l’histoire'}</Link>
        {' · '}
        {plural(c.readingMinutes, 'minute')} de lecture
      </p>
      <div>
        <p className={styles.eyebrow}>Chapitre {c.number}</p>
        <h1 className={styles.chapterTitle}>{c.title || `Chapitre ${c.number}`}</h1>
      </div>
      {(() => {
        const doc = parseDocument(c.content);
        return doc.success ? (
          <ChapterContent doc={doc.data} />
        ) : (
          <Alert tone="danger" title="Ce chapitre ne peut pas s’afficher.">
            <p>Son contenu est illisible. Signalez-le à l’équipe.</p>
          </Alert>
        );
      })()}
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
