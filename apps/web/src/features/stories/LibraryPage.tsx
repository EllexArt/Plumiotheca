import { Shelf } from '@plumiotheca/contracts';
import { Link } from 'react-router';
import { ButtonLink } from '../../shared/ui/Button';
import { Alert, Loading } from '../../shared/ui/Feedback';
import { LoadMoreFooter, useLoadMore } from '../../shared/ui/LoadMore';
import { Page } from '../../shared/ui/Page';
import { shelfLabel, useShelf } from './library';
import styles from './Reading.module.css';
import { StoryCard } from './ReadingPages';
import { ShelfSelect } from './ShelfSelect';

const EMPTY: Record<Shelf, string> = {
  reading: 'Les histoires que vous commencez apparaissent ici, avec l’endroit où vous en êtes.',
  to_read: 'Rangez ici les histoires que vous voulez lire plus tard.',
  finished: 'Les histoires que vous avez terminées.',
};

/** Mes lectures (#30) : trois étagères, visibles de vous seulement. */
export function LibraryPage() {
  return (
    <Page
      title="Mes lectures"
      lead="Les histoires que vous lisez, celles à lire et celles terminées, sur tous vos appareils. Personne d’autre ne les voit."
    >
      {Shelf.options.map((shelf) => (
        <ShelfSection key={shelf} shelf={shelf} />
      ))}
      <p>
        <Link to="/">Trouver une histoire dans Explorer</Link>
      </p>
    </Page>
  );
}

function ShelfSection({ shelf }: { shelf: Shelf }) {
  const query = useShelf(shelf);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const { list, loadMore } = useLoadMore(
    items.map((i) => i.story.id),
    query,
  );
  const heading = `etagere-${shelf}`;
  return (
    <section aria-labelledby={heading} className={styles.shelf}>
      <h2 id={heading} className={styles.sectionTitle}>
        {shelfLabel[shelf]}
      </h2>
      {query.isPending ? (
        <Loading label="Chargement…" />
      ) : query.isError && !query.data ? (
        <Alert tone="danger" live title="Cette étagère n’a pas pu être chargée.">
          <p>{query.error.message}</p>
        </Alert>
      ) : items.length ? (
        <ul className={styles.grid} aria-label={`Mes lectures : ${shelfLabel[shelf]}`} ref={list}>
          {items.map((item) => (
            <li key={item.story.id} className={styles.libraryItem}>
              <StoryCard story={item.story} />
              <div className={styles.libraryActions}>
                {item.chapterId && (
                  <ButtonLink
                    to={`/histoires/${item.story.id}/chapitres/${item.chapterId}`}
                    state={{ reprise: item.blockId }}
                    variant="secondary"
                    size="small"
                  >
                    Reprendre
                    <span className="visually-hidden"> {item.story.title}</span>
                  </ButtonLink>
                )}
                <ShelfSelect
                  storyId={item.story.id}
                  shelf={item.shelf}
                  label={`Ranger « ${item.story.title} »`}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.meta}>{EMPTY[shelf]}</p>
      )}
      <LoadMoreFooter
        query={query}
        onLoadMore={loadMore}
        label="Voir plus"
        errorTitle="La suite de l’étagère n’a pas pu être chargée."
      />
    </section>
  );
}
