import { useEffect, useRef } from 'react';
import { Button } from './Button';
import { Alert } from './Feedback';

/** Ce qu'il faut d'une requête paginée (useInfiniteQuery) pour « Voir plus ». */
interface Paged {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  error: Error | null;
  fetchNextPage: () => Promise<unknown>;
}

/**
 * « Voir plus » commun (#160) : charge la page suivante puis place le focus sur le premier
 * élément ajouté, repéré par son identifiant (`data-focus` sur son lien). Si rien n'arrive
 * (échec, page vide) ou si la liste change (`resetKey`, autres filtres), plus de focus à
 * déplacer : il sauterait sinon plus tard, à un ajout sans rapport.
 */
export function useLoadMore<E extends HTMLElement = HTMLUListElement>(
  ids: string[],
  query: Paged,
  resetKey?: unknown,
) {
  const list = useRef<E>(null);
  // Identifiant attendu : celui du premier élément de la page suivante, une fois là.
  const focusFrom = useRef<number | null>(null);

  useEffect(() => {
    const from = focusFrom.current;
    if (from === null || ids.length <= from) return;
    list.current?.querySelector<HTMLElement>(`[data-focus="${ids[from]}"]`)?.focus();
    focusFrom.current = null;
  }, [ids]);

  const fetching = query.isFetchingNextPage;
  useEffect(() => {
    const from = focusFrom.current;
    if (!fetching && from !== null && ids.length <= from) focusFrom.current = null;
  }, [fetching, ids.length]);

  useEffect(() => {
    focusFrom.current = null;
  }, [resetKey]);

  const loadMore = () => {
    focusFrom.current = ids.length;
    void query.fetchNextPage();
  };
  return { list, loadMore };
}

/** Pied de liste : alerte si la page suivante a échoué (la liste reste), puis le bouton. */
export function LoadMoreFooter({
  query,
  onLoadMore,
  label,
  errorTitle,
}: {
  query: Paged;
  onLoadMore: () => void;
  /** Texte du bouton (« Voir plus d’histoires »). */
  label: string;
  /** Titre de l'alerte en cas d'échec. */
  errorTitle: string;
}) {
  return (
    <>
      {query.isFetchNextPageError && (
        <Alert tone="danger" live title={errorTitle}>
          <p>{query.error?.message} Vous pouvez réessayer avec le bouton ci-dessous.</p>
        </Alert>
      )}
      {query.hasNextPage && (
        <div>
          <Button variant="secondary" pending={query.isFetchingNextPage} onClick={onLoadMore}>
            {query.isFetchingNextPage ? 'Chargement…' : label}
          </Button>
        </div>
      )}
    </>
  );
}
