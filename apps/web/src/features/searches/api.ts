import {
  SavedSearch,
  SavedSearchList,
  type NewSavedSearch,
  type UpdateSavedSearch,
} from '@plumiotheca/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'react-oidc-context';
import { useApi } from '../../shared/api/useApi';

const keys = {
  all: ['moi', 'recherches'] as const,
  notifications: ['moi', 'notifications'] as const,
};

/** Mes recherches enregistrées (#80), la plus récente d'abord. */
export function useSavedSearches() {
  const api = useApi();
  const signedIn = useAuth().isAuthenticated;
  return useQuery({
    queryKey: keys.all,
    enabled: signedIn,
    queryFn: async ({ signal }) =>
      (await api(SavedSearchList, '/moi/recherches', { signal })).items,
  });
}

export function useSaveSearch() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewSavedSearch) =>
      api(SavedSearch, '/moi/recherches', { method: 'POST', body: input }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

/** Renommer, ou activer et couper les alertes ; les notifications suivent. */
export function useUpdateSavedSearch() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateSavedSearch & { id: string }) =>
      api(SavedSearch, `/moi/recherches/${id}`, { method: 'PATCH', body: input }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.all });
      await queryClient.invalidateQueries({ queryKey: keys.notifications });
    },
  });
}

export function useRemoveSavedSearch() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(null, `/moi/recherches/${id}`, { method: 'DELETE' }),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.all });
      await queryClient.invalidateQueries({ queryKey: keys.notifications });
    },
  });
}

/** Nom proposé pour une recherche : le texte cherché, ou les filtres principaux. */
export function suggestedName(params: URLSearchParams): string {
  const parts = [
    params.get('q'),
    params.get('tag'),
    params.get('relations'),
    params.get('tags'),
    params.get('personnages'),
  ]
    .filter(Boolean)
    .map((p) => p!.replace(/,/g, ', '));
  return (parts.join(' · ') || 'Ma recherche').slice(0, 100);
}
