import {
  NewSelection,
  Selection,
  SelectionList,
  UpdateSelection,
  type NewSelection as NewSelectionInput,
  type UpdateSelection as UpdateSelectionInput,
} from '@plumiotheca/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'react-oidc-context';
import { useApi } from '../../shared/api/useApi';

/** Sélections (#30) : les siennes, les étagères publiques, la page d'une sélection. */
export const selectionKeys = {
  all: ['selections'] as const,
  mine: (storyId?: string) => ['selections', 'miennes', storyId ?? null] as const,
  public: (handle?: string) => ['selections', 'publiques', handle ?? null] as const,
  one: (id: string) => ['selections', id] as const,
};

/** Mes sélections ; avec `storyId`, chacune dit si elle contient l'histoire. */
export function useMySelections(storyId?: string, enabled = true) {
  const api = useApi();
  const signedIn = useAuth().isAuthenticated;
  return useQuery({
    queryKey: selectionKeys.mine(storyId),
    queryFn: ({ signal }) =>
      api(SelectionList, `/moi/selections${storyId ? `?histoire=${storyId}` : ''}`, { signal }),
    enabled: signedIn && enabled,
  });
}

/** Étagères publiques (Explorer), ou celles d'une personne (son profil). */
export function usePublicSelections(handle?: string) {
  const api = useApi();
  return useQuery({
    queryKey: selectionKeys.public(handle),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ limite: '6' });
      if (handle) params.set('pseudonyme', handle);
      return api(SelectionList, `/selections?${params}`, { signal });
    },
  });
}

export function useSelection(id: string) {
  const api = useApi();
  const auth = useAuth();
  return useQuery({
    queryKey: [...selectionKeys.one(id), auth.isAuthenticated],
    queryFn: ({ signal }) => api(Selection, `/selections/${id}`, { signal }),
  });
}

/** Créer, modifier, supprimer, remplir : chaque changement rafraîchit les sélections. */
export function useSelectionActions() {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: selectionKeys.all });
  return {
    create: useMutation({
      mutationFn: (input: NewSelectionInput) =>
        api(Selection, '/moi/selections', { method: 'POST', body: NewSelection.parse(input) }),
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, ...input }: UpdateSelectionInput & { id: string }) =>
        api(Selection, `/moi/selections/${id}`, {
          method: 'PATCH',
          body: UpdateSelection.parse(input),
        }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api(null, `/moi/selections/${id}`, { method: 'DELETE' }),
      onSuccess: refresh,
    }),
    toggleStory: useMutation({
      mutationFn: ({ id, storyId, add }: { id: string; storyId: string; add: boolean }) =>
        api(Selection, `/moi/selections/${id}/histoires/${storyId}`, {
          method: add ? 'PUT' : 'DELETE',
        }),
      onSuccess: refresh,
    }),
  };
}
