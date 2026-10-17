import {
  LibraryPage,
  LibraryStatus,
  type ReadingPosition,
  type Shelf,
} from '@plumiotheca/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'react-oidc-context';
import { useApi } from '../../shared/api/useApi';

/** « Mes lectures » (#30), sur le compte : étagères et position de lecture. */
export const libraryKeys = {
  all: ['moi', 'lectures'] as const,
  shelf: (shelf: Shelf) => ['moi', 'lectures', 'etagere', shelf] as const,
  story: (storyId: string) => ['moi', 'lectures', 'histoire', storyId] as const,
};

export const shelfLabel: Record<Shelf, string> = {
  reading: 'En cours',
  to_read: 'À lire',
  finished: 'Terminées',
};

/** Place d'une histoire dans Mes lectures (personnes connectées seulement). */
export function useLibraryStatus(storyId: string) {
  const api = useApi();
  const signedIn = useAuth().isAuthenticated;
  return useQuery({
    queryKey: libraryKeys.story(storyId),
    queryFn: ({ signal }) => api(LibraryStatus, `/moi/lectures/${storyId}`, { signal }),
    enabled: signedIn && !!storyId,
  });
}

/** Une étagère, la plus récente d'abord, par pages de 20. */
export function useShelf(shelf: Shelf) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: libraryKeys.shelf(shelf),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ etagere: shelf, limite: '20' });
      if (pageParam) params.set('apres', pageParam);
      return api(LibraryPage, `/moi/lectures?${params}`, { signal });
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Range une histoire (null : la retire de Mes lectures). */
export function useSetShelf(storyId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (shelf: Shelf | null) =>
      shelf
        ? api(LibraryStatus, `/moi/lectures/${storyId}`, { method: 'PUT', body: { shelf } })
        : api(null, `/moi/lectures/${storyId}`, { method: 'DELETE' }).then(() => ({
            entry: null,
          })),
    onSuccess: (status) => {
      queryClient.setQueryData(libraryKeys.story(storyId), status);
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
    },
  });
}

/** Enregistre la position de lecture (ouvrir une histoire l'ajoute à Mes lectures). */
export function useSavePosition(storyId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (position: ReadingPosition) =>
      api(LibraryStatus, `/moi/lectures/${storyId}/position`, { method: 'PUT', body: position }),
    onSuccess: (status) => queryClient.setQueryData(libraryKeys.story(storyId), status),
  });
}
