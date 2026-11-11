import type { GardenTag } from '@plumiotheca/contracts';
import { useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Button } from '../../shared/ui/Button';
import { Alert, Loading } from '../../shared/ui/Feedback';
import { TextField } from '../../shared/ui/Field';
import { LoadMoreFooter, useLoadMore } from '../../shared/ui/LoadMore';
import { Page } from '../../shared/ui/Page';
import { formatDate, plural } from '../stories/labels';
import styles from '../stories/Reading.module.css';
import {
  useGardenAction,
  useGardenSearch,
  useSession,
  useTagJournal,
  type GardenAction,
} from './api';

/**
 * Jardinage des tags (#78), pour les jardiniers et jardinières (rôle « jardinage-tags ») :
 * chercher un tag, le rattacher comme synonyme, l'en détacher, le ranger sous un parent,
 * le renommer ; le journal des opérations, chacune annulable tant que ses tags n'ont pas
 * changé.
 */
export function GardenPage() {
  const session = useSession();
  const [q, setQ] = useState('');
  const [done, setDone] = useState('');
  const action = useGardenAction();
  const journalHeading = useRef<HTMLHeadingElement>(null);

  if (session.isPending) return <Loading label="Chargement…" />;
  if (!session.data?.roles.includes('jardinage-tags')) {
    return (
      <Page title="Jardinage des tags" width="narrow">
        <p>Cette page est réservée aux jardiniers et jardinières des tags.</p>
      </Page>
    );
  }

  const run = (act: GardenAction, message: string, then?: () => void) =>
    action.mutateAsync(act).then(
      () => {
        setDone(message);
        then?.();
      },
      () => setDone(''),
    );

  const search = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQ(String(new FormData(event.currentTarget).get('q') ?? '').trim());
  };

  return (
    <Page
      title="Jardinage des tags"
      lead="Rattacher les synonymes à leur tag canonique, ranger les tags sous un parent, corriger un nom. Les histoires gardent leurs tags : la recherche et l’affichage suivent. Chaque opération est journalisée et peut être annulée."
    >
      <form role="search" className={styles.search} onSubmit={search}>
        <TextField label="Chercher un tag" name="q" type="search" maxLength={100} />
        <div>
          <Button type="submit" variant="secondary">
            Chercher
          </Button>
        </div>
      </form>
      {/* Résultat de la dernière opération, annoncé (le focus reste sur le bouton). */}
      <output className={styles.meta}>{done}</output>
      {action.isError && (
        <Alert tone="danger" live title="L’opération n’a pas été faite.">
          <p>{action.error.message}</p>
        </Alert>
      )}
      {q && <Results q={q} run={run} pending={action.isPending} />}
      <Journal run={run} heading={journalHeading} pending={action.isPending} />
    </Page>
  );
}

type Run = (act: GardenAction, message: string, then?: () => void) => Promise<void>;

function Results({ q, run, pending }: { q: string; run: Run; pending: boolean }) {
  const tags = useGardenSearch(q);
  if (tags.isPending) return <Loading label="Recherche des tags…" />;
  if (tags.isError) {
    return (
      <Alert tone="danger" title="La recherche n’a pas abouti.">
        <p>{tags.error.message}</p>
      </Alert>
    );
  }
  if (!tags.data.length) return <p>Aucun tag ne correspond à « {q} ».</p>;
  return (
    <section aria-labelledby="resultats" className={styles.shelf}>
      <h2 id="resultats">Tags trouvés pour « {q} »</h2>
      <ul className={styles.notifications} aria-label={`Tags trouvés pour « ${q} »`}>
        {tags.data.map((tag) => (
          <li key={tag.id}>
            <TagCard tag={tag} run={run} pending={pending} />
          </li>
        ))}
      </ul>
    </section>
  );
}

const names = (list: { name: string }[]) => list.map((t) => `« ${t.name} »`).join(', ');

function TagCard({ tag, run, pending }: { tag: GardenTag; run: Run; pending: boolean }) {
  // Espace hors de la partie masquée : sinon le nom accessible colle les deux mots.
  const about = (
    <>
      {' '}
      <span className="visually-hidden">(tag « {tag.name} »)</span>
    </>
  );
  return (
    <>
      <h3 className={styles.cardTitle}>{tag.name}</h3>
      <p className={styles.meta}>
        {plural(tag.stories, 'histoire')}
        {tag.canonical && <> · synonyme de « {tag.canonical.name} »</>}
        {tag.parent && <> · rangé sous « {tag.parent.name} »</>}
        {tag.synonyms.length > 0 && <> · synonymes : {names(tag.synonyms)}</>}
        {tag.children.length > 0 && <> · sous-tags : {names(tag.children)}</>}
      </p>
      <details className={styles.limitsDetails}>
        <summary>
          Modifier <span className="visually-hidden">« {tag.name} »</span>
        </summary>
        <div className={styles.limitsPanel}>
          {tag.canonical ? (
            <div>
              <Button
                variant="secondary"
                size="small"
                pending={pending}
                onClick={() =>
                  void run(
                    { kind: 'split', id: tag.id },
                    `« ${tag.name} » détaché de « ${tag.canonical!.name} ».`,
                  )
                }
              >
                Détacher de « {tag.canonical.name} »
              </Button>
            </div>
          ) : (
            <>
              <NameForm
                label={<>Ranger sous le tag{about}</>}
                button="Ranger"
                pending={pending}
                onSubmit={(parent) =>
                  run(
                    { kind: 'parent', id: tag.id, parent },
                    `« ${tag.name} » rangé sous « ${parent} ».`,
                  )
                }
              />
              {tag.parent && (
                <div>
                  <Button
                    variant="ghost"
                    size="small"
                    pending={pending}
                    onClick={() =>
                      void run(
                        { kind: 'parent', id: tag.id, parent: null },
                        `« ${tag.name} » n’a plus de parent.`,
                      )
                    }
                  >
                    Retirer de « {tag.parent.name} »
                  </Button>
                </div>
              )}
            </>
          )}
          <NameForm
            label={<>Rattacher comme synonyme de{about}</>}
            button="Rattacher"
            pending={pending}
            onSubmit={(into) =>
              run(
                { kind: 'merge', id: tag.id, into },
                `« ${tag.name} » rattaché comme synonyme à « ${into} ».`,
              )
            }
          />
          <NameForm
            label={<>Nouveau nom{about}</>}
            button="Renommer"
            pending={pending}
            onSubmit={(name) =>
              run({ kind: 'rename', id: tag.id, name }, `« ${tag.name} » renommé « ${name} ».`)
            }
          />
        </div>
      </details>
    </>
  );
}

/** Un champ (nom d'un tag) et son bouton ; vidé après une opération réussie. */
function NameForm({
  label,
  button,
  pending,
  onSubmit,
}: {
  label: ReactNode;
  button: string;
  pending: boolean;
  onSubmit: (value: string) => Promise<void>;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const value = String(new FormData(form).get('nom') ?? '').trim();
    if (value) void onSubmit(value).then(() => form.reset());
  };
  return (
    <form className={styles.search} onSubmit={submit}>
      <TextField label={label} name="nom" maxLength={100} required />
      <div>
        <Button type="submit" variant="secondary" size="small" pending={pending}>
          {button}
        </Button>
      </div>
    </form>
  );
}

function Journal({
  run,
  heading,
  pending,
}: {
  run: Run;
  heading: RefObject<HTMLHeadingElement | null>;
  pending: boolean;
}) {
  const journal = useTagJournal();
  const items = journal.data?.pages.flatMap((p) => p.items) ?? [];
  const { list, loadMore } = useLoadMore(
    items.map((i) => i.id),
    journal,
  );
  return (
    <section aria-labelledby="journal" className={styles.shelf}>
      <h2 id="journal" ref={heading} tabIndex={-1}>
        Journal
      </h2>
      {journal.isPending ? (
        <Loading label="Chargement du journal…" />
      ) : journal.isError && !journal.data ? (
        <Alert tone="danger" title="Le journal n’a pas pu être chargé.">
          <p>{journal.error.message}</p>
        </Alert>
      ) : items.length ? (
        <>
          <ul className={styles.notifications} aria-label="Opérations" ref={list}>
            {items.map((op) => (
              <li key={op.id}>
                <p data-focus={op.id} tabIndex={-1}>
                  {op.summary}
                </p>
                <p className={styles.meta}>
                  {op.by ? `@${op.by}` : 'compte supprimé'}, le {formatDate(op.at)}
                  {op.revertedAt && <> · annulée le {formatDate(op.revertedAt)}</>}
                </p>
                {op.revertible && (
                  <div>
                    <Button
                      variant="ghost"
                      size="small"
                      pending={pending}
                      onClick={() =>
                        void run(
                          { kind: 'revert', operationId: op.id },
                          `Annulé : ${op.summary}.`,
                          // Le bouton disparaît avec l'annulation : focus sur le journal.
                          () => heading.current?.focus(),
                        )
                      }
                    >
                      Annuler <span className="visually-hidden">: {op.summary}</span>
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <LoadMoreFooter
            query={journal}
            onLoadMore={loadMore}
            label="Voir plus d’opérations"
            errorTitle="Les opérations suivantes n’ont pas pu être chargées."
          />
        </>
      ) : (
        <p>Aucune opération pour l’instant.</p>
      )}
    </section>
  );
}
