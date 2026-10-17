import type { StorySummary } from '@plumiotheca/contracts';
import { parseDocument } from '@plumiotheca/editor-schema';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useAuth } from 'react-oidc-context';
import { Link, useLocation, useParams, useSearchParams } from 'react-router';
import { ApiError } from '../../shared/api/client';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { Alert, Loading, Tag } from '../../shared/ui/Feedback';
import { LoadMoreFooter, useLoadMore } from '../../shared/ui/LoadMore';
import { TextField } from '../../shared/ui/Field';
import { Page, usePageTitle } from '../../shared/ui/Page';
import { useChapter, usePublicStories, useStory, type StoryFilters } from './api';
import { ChapterContent } from './ChapterContent';
import {
  completionLabel,
  contentWarningsText,
  coverColors,
  formatDate,
  formatNumber,
  plural,
  ratingLabel,
  warningsText,
} from './labels';
import { useLibraryStatus, useSavePosition } from './library';
import { AddToSelection, PublicShelves } from './SelectionPages';
import { ShelfSelect } from './ShelfSelect';
import { useResume, useTrackPosition } from './readingPosition';
import styles from './Reading.module.css';
import { LimitsPanel } from './LimitsPanel';
import {
  filterExclusions,
  hasFilters,
  readFilters,
  writeFilters,
  type SearchFilters,
} from './filters';
import { SearchFiltersPanel } from './SearchFiltersPanel';
import { limitReasons, useLimits } from './limits';
import { useReadingPreferences } from './readingPreferences';
import { ReadingProgress } from './ReadingProgress';
import { ReadingSettings } from './ReadingSettings';

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
export function AuthorLink({ author }: { author: StorySummary['author'] }) {
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
      {story.contentWarnings.length ? (
        <li>
          <Tag kind="warning">
            Autres avertissements : {contentWarningsText(story.contentWarnings)}
          </Tag>
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

/**
 * Carte d'une histoire. `hiddenBecause` : histoire affichée exceptionnellement alors que
 * Mes limites la masquent d'habitude ; la raison est dite (#81). `filteredBecause` : de
 * même pour les exclusions des filtres de la recherche (#32).
 */
export function StoryCard({
  story,
  hiddenBecause = [],
  filteredBecause = [],
}: {
  story: StorySummary;
  hiddenBecause?: string[];
  filteredBecause?: string[];
}) {
  return (
    <article className={styles.card}>
      <div className={styles.spine} style={coverColors(story.id)} aria-hidden="true">
        {story.title}
      </div>
      <div className={styles.cardBody}>
        <h2 className={styles.cardTitle} lang={story.language}>
          <Link to={`/histoires/${story.id}`} data-focus={story.id}>
            {story.title}
          </Link>
        </h2>
        <p className={styles.meta}>
          par <AuthorLink author={story.author} /> · {plural(story.chapterCount, 'chapitre')} ·{' '}
          {completionLabel[story.completion]}
        </p>
        {story.summary && (
          <p className={styles.summary} lang={story.language}>
            {story.summary}
          </p>
        )}
        <StoryTags story={story} />
        {hiddenBecause.length > 0 && (
          <p className={styles.meta}>
            <Tag kind="neutral">Masquée d’habitude</Tag> par vos limites :{' '}
            {hiddenBecause.join(', ')}.
          </p>
        )}
        {filteredBecause.length > 0 && (
          <p className={styles.meta}>
            <Tag kind="neutral">Exclue par vos filtres</Tag> : {filteredBecause.join(', ')}.
          </p>
        )}
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
  // « Les afficher pour cette fois » (#81) : ce qui est masqué reste toujours consultable.
  const [revealed, setRevealed] = useState(false);
  const { limits } = useLimits();
  // Exclusions des filtres (#32), dites à part de Mes limites.
  const excluded = filterExclusions(filters.search);
  const stories = usePublicStories({ ...filters, reveal: revealed });
  const items = stories.data?.pages.flatMap((page) => page.items) ?? [];
  const { list, loadMore } = useLoadMore(
    items.map((story) => story.id),
    stories,
    `${filters.tag}|${filters.pseudonyme}|${filters.q}|${revealed}|${JSON.stringify(filters.search)}`,
  );

  const hidden = stories.data?.pages[0]?.hidden ?? 0;
  // Toujours présente : une zone annoncée doit exister avant que son contenu change.
  const hiddenNote = (
    <div className={styles.hiddenNote}>
      <output className={styles.meta}>
        {revealed
          ? 'Les histoires masquées sont affichées pour cette fois, avec la raison.'
          : hidden > 0 &&
            `${plural(hidden, 'histoire masquée', 'histoires masquées')} par vos limites${excluded ? ' ou vos filtres' : ''}.`}
      </output>
      {(revealed || hidden > 0) && (
        <Button variant="ghost" size="small" onClick={() => setRevealed(!revealed)}>
          {revealed ? 'Les masquer de nouveau' : 'Les afficher pour cette fois'}
        </Button>
      )}
    </div>
  );

  if (stories.isPending) {
    return (
      <>
        {hiddenNote}
        <Loading label="Chargement des histoires…" />
      </>
    );
  }
  // Seule la première page en échec remplace la liste ; « Voir plus » en échec la garde.
  if (stories.isError && !stories.data) {
    return (
      <Alert tone="danger" live title="Les histoires n’ont pas pu être chargées.">
        <p>{stories.error.message}</p>
      </Alert>
    );
  }
  if (!items.length) {
    return (
      <>
        {hiddenNote}
        {empty}
      </>
    );
  }
  return (
    <>
      {hiddenNote}
      <ul className={styles.grid} aria-label={label} ref={list}>
        {items.map((story) => (
          <li key={story.id}>
            <StoryCard
              story={story}
              hiddenBecause={revealed ? limitReasons(story, limits) : []}
              filteredBecause={revealed && excluded ? limitReasons(story, excluded) : []}
            />
          </li>
        ))}
      </ul>
      <LoadMoreFooter
        query={stories}
        onLoadMore={loadMore}
        label="Voir plus d’histoires"
        errorTitle="Les histoires suivantes n’ont pas pu être chargées."
      />
    </>
  );
}

/**
 * Explorer (#21) : les dernières histoires publiées, filtrables par tag ; recherche plein
 * texte (#82) par titre, tag, nom ou résumé. La requête est dans l'adresse (partageable).
 */
export function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() || undefined;
  const tag = q ? undefined : params.get('tag')?.trim() || undefined;
  // Filtres (#32) : dans l'adresse, partageables ; gardés d'une recherche à l'autre.
  const search = readFilters(params);
  const filters = { tag, q, search };
  // Même requête que la liste (reveal: false), pour ne pas la charger deux fois.
  const stories = usePublicStories({ ...filters, reveal: false });
  const empty = stories.isSuccess && !stories.data.pages[0]?.items.length;
  const total = stories.data?.pages[0]?.total;
  const shownTags = (stories.data?.pages ?? []).flatMap((page) =>
    page.items.flatMap((s) => s.tags),
  );
  const active = hasFilters(search);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('q') ?? '').trim();
    setParams(writeFilters(new URLSearchParams(value ? { q: value } : {}), search));
  };
  const changeFilters = (next: SearchFilters) =>
    setParams(writeFilters(params, next), { replace: true, preventScrollReset: true });

  return (
    <Page
      title={q ? `Résultats pour « ${q} »` : tag ? `Histoires avec le tag « ${tag} »` : 'Explorer'}
      lead={
        q || tag
          ? undefined
          : 'Les dernières histoires publiées. Bientôt : des sélections composées par des lectrices et lecteurs, des autrices et auteurs, et l’équipe. Pas de fil choisi par un algorithme.'
      }
    >
      <form role="search" className={styles.search} onSubmit={submit} key={q ?? ''}>
        <TextField
          label="Rechercher une histoire"
          name="q"
          type="search"
          hint="Titre, tag, nom de l’autrice ou de l’auteur, résumé."
          maxLength={200}
          defaultValue={q ?? ''}
        />
        <div>
          <Button type="submit" variant="secondary">
            Rechercher
          </Button>
        </div>
      </form>
      <details className={styles.limitsDetails} open={active || undefined}>
        <summary>Filtres{active ? ' (actifs)' : ''}</summary>
        <SearchFiltersPanel
          filters={search}
          onChange={changeFilters}
          suggestedTags={shownTags}
          searching={!!q}
        />
      </details>
      <details className={styles.limitsDetails}>
        <summary>Masquer certains sujets</summary>
        <LimitsPanel />
      </details>
      {(tag || q) && (
        <p>
          <Link to="/">Voir toutes les histoires</Link>
        </p>
      )}
      {/* Nombre de résultats, annoncé en direct (recherche et filtres) : le focus reste en place. */}
      <output className={styles.meta}>
        {stories.isSuccess && total !== undefined
          ? total
            ? plural(total, q ? 'résultat' : 'histoire')
            : q
              ? 'Aucun résultat.'
              : 'Aucune histoire.'
          : ''}
      </output>
      {!q && !tag && !active && <PublicShelves title="Sélections des membres" />}
      <StoryList
        filters={filters}
        label={
          q
            ? 'Résultats de la recherche'
            : tag
              ? `Histoires avec le tag ${tag}`
              : 'Dernières histoires publiées'
        }
      />
      {empty && (
        <div className={styles.empty}>
          {active ? (
            <p>Aucune histoire ne correspond à ces filtres. Essayez d’en retirer un.</p>
          ) : q ? (
            <p>Aucune histoire ne correspond à « {q} ». Essayez un autre mot, ou moins de mots.</p>
          ) : tag ? (
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
  // Mes lectures (#30) : où reprendre, sur tous les appareils.
  const library = useLibraryStatus(storyId);
  usePageTitle(story.data?.title ?? 'Histoire');

  if (story.isPending) return <Loading label="Chargement de l’histoire…" />;
  if (story.isError) return <LoadError error={story.error} what="story" />;
  const s = story.data;
  const published = s.chapters.filter((c) => c.status === 'published');
  const first = published[0];
  // Chapitre où reprendre (Mes lectures), s'il est toujours publié.
  const entry = auth.isAuthenticated ? library.data?.entry : null;
  const resumeAt = entry?.chapterId ? published.findIndex((c) => c.id === entry.chapterId) : -1;

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
              // Le lecteur ramène au dernier paragraphe lu (#29).
              state={{ reprise: entry?.blockId }}
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
          {auth.isAuthenticated && library.isSuccess && (
            <ShelfSelect storyId={s.id} shelf={library.data.entry?.shelf ?? null} />
          )}
          {auth.isAuthenticated && <AddToSelection storyId={s.id} />}
        </div>

        <div className={styles.main}>
          <div>
            <h1 className={styles.storyTitle} lang={s.language}>
              {s.title}
            </h1>
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
            <div>
              <dt>{s.readCount === 1 ? 'lecture' : 'lectures'}</dt>
              <dd>{formatNumber(s.readCount)}</dd>
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
              <p lang={s.language}>{s.summary}</p>
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
  const reading = useReadingPreferences();
  // Mes lectures (#30) : ouvrir un chapitre l'y ajoute (en cours) ; rouvrir le même chapitre
  // garde le paragraphe retenu. Puis le paragraphe en cours, au fil de la lecture.
  const library = useLibraryStatus(storyId);
  const { mutate: savePosition } = useSavePosition(storyId);
  const known = library.data?.entry?.chapterId;
  const tracking = opened && signedIn && library.isSuccess;
  useEffect(() => {
    if (tracking && known !== chapterId) savePosition({ chapterId, blockId: null });
  }, [tracking, known, chapterId, savePosition]);
  useTrackPosition(article, tracking, (blockId) => savePosition({ chapterId, blockId }));
  const resume = (useLocation().state as { reprise?: string | null } | null)?.reprise;
  useResume(resume, opened);
  const title = chapter.data
    ? `${chapter.data.title || `Chapitre ${chapter.data.number}`} — ${story.data?.title ?? ''}`
    : 'Chapitre';
  usePageTitle(title);

  if (chapter.isPending) return <Loading label="Chargement du chapitre…" />;
  if (chapter.isError) return <LoadError error={chapter.error} what="chapter" />;
  const c = chapter.data;

  return (
    <article
      className={styles.reader}
      ref={article}
      data-font={reading.preferences.font}
      data-leading={reading.preferences.lineHeight}
      data-width={reading.preferences.width}
      // Ambiance imposée au lecteur (#77) : ses jetons s'appliquent à l'article seulement.
      data-ambiance={reading.preferences.ambiance}
      // Variable CSS posée par le DOM (pas d'attribut style dans le HTML) : permise par la CSP.
      style={{ '--reader-scale': reading.preferences.size / 100 } as CSSProperties}
    >
      <ReadingProgress target={article} />
      <div className={styles.readerBar}>
        <p className={styles.crumb}>
          <Link to={`/histoires/${storyId}`}>{story.data?.title ?? 'Retour à l’histoire'}</Link>
          {' · '}
          {plural(c.readingMinutes, 'minute')} de lecture
        </p>
        <ReadingSettings
          preferences={reading.preferences}
          onChange={reading.change}
          onAccount={reading.onAccount}
          saveFailed={reading.saveFailed}
        />
      </div>
      <div>
        <p className={styles.eyebrow}>Chapitre {c.number}</p>
        <h1 className={styles.chapterTitle} lang={c.title ? story.data?.language : undefined}>
          {c.title || `Chapitre ${c.number}`}
        </h1>
      </div>
      {(() => {
        const doc = parseDocument(c.content);
        return doc.success ? (
          <ChapterContent doc={doc.data} lang={story.data?.language} />
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
