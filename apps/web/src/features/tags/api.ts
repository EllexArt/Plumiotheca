import { GardenTag, GardenTagList, MySession, TagJournal } from '@plumiotheca/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'react-oidc-context';
import { useApi } from '../../shared/api/useApi';

const keys = {
  session: ['moi', 'session'] as const,
  garden: ['jardinage'] as const,
  search: (q: string) => ['jardinage', 'tags', q] as const,
  journal: ['jardinage', 'journal'] as const,
};

/** Rôles de la session (menus) : rien sans compte. */
export function useSession() {
  const api = useApi();
  const signedIn = useAuth().isAuthenticated;
  return useQuery({
    queryKey: keys.session,
    enabled: signedIn,
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => api(MySession, '/moi/session', { signal }),
  });
}

export const useIsGardener = () => useSession().data?.roles.includes('jardinage-tags') ?? false;

export function useGardenSearch(q: string) {
  const api = useApi();
  return useQuery({
    queryKey: keys.search(q),
    enabled: q.length > 0,
    queryFn: async ({ signal }) =>
      (await api(GardenTagList, `/jardinage/tags?q=${encodeURIComponent(q)}`, { signal })).items,
  });
}

export function useTagJournal() {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: keys.journal,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api(TagJournal, `/jardinage/journal${pageParam ? `?apres=${pageParam}` : ''}`, { signal }),
    getNextPageParam: (last) => last.nextCursor,
  });
}

export type GardenAction =
  | { kind: 'merge'; id: string; into: string }
  | { kind: 'split'; id: string }
  | { kind: 'parent'; id: string; parent: string | null }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'revert'; operationId: string };

/** Une opération de jardinage ; tags et journal rechargés ensuite. */
export function useGardenAction() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: GardenAction): Promise<unknown> => {
      switch (action.kind) {
        case 'merge':
          return api(GardenTag, `/jardinage/tags/${action.id}/fusion`, {
            method: 'POST',
            body: { into: action.into },
          });
        case 'split':
          return api(GardenTag, `/jardinage/tags/${action.id}/separation`, { method: 'POST' });
        case 'parent':
          return api(GardenTag, `/jardinage/tags/${action.id}/parent`, {
            method: 'PUT',
            body: { parent: action.parent },
          });
        case 'rename':
          return api(GardenTag, `/jardinage/tags/${action.id}/nom`, {
            method: 'PUT',
            body: { name: action.name },
          });
        case 'revert':
          return api(null, `/jardinage/journal/${action.operationId}/annulation`, {
            method: 'POST',
          });
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.garden }),
  });
}
