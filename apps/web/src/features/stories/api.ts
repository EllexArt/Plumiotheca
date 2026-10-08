import {
  ChapterDraft,
  ChapterRead,
  SavedDraft,
  StoryDetail,
  StoryPage,
  type NewStory,
  type UpdateStory,
} from '@plumiotheca/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'react-oidc-context';
import { useApi } from '../../shared/api/useApi';

export const storyKeys = {
  public: ['histoires', 'publiques'] as const,
  mine: ['moi', 'histoires'] as const,
  detail: (id: string) => ['histoires', id] as const,
  chapter: (storyId: string, chapterId: string) =>
    ['histoires', storyId, 'chapitres', chapterId] as const,
  draft: (storyId: string, chapterId: string) =>
    ['histoires', storyId, 'brouillons', chapterId] as const,
};

/** Filtres de la liste publique. */
export interface StoryFilters {
  tag?: string | undefined;
  pseudonyme?: string | undefined;
}

/**
 * Histoires publiées, les plus récentes d'abord, par pages de 20 (curseur de l'API) :
 * « Voir plus d'histoires » charge la suivante.
 */
export function usePublicStories(filters: StoryFilters = {}) {
  const api = useApi();
  const auth = useAuth();
  return useInfiniteQuery({
    queryKey: [...storyKeys.public, filters, auth.isAuthenticated],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limite: '20' });
      if (filters.tag) params.set('tag', filters.tag);
      if (filters.pseudonyme) params.set('pseudonyme', filters.pseudonyme);
      if (pageParam) params.set('apres', pageParam);
      return api(StoryPage, `/histoires?${params}`, { signal });
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Fiche d'une histoire et son sommaire (brouillons compris pour son autrice ou son auteur). */
export function useStory(id: string) {
  const api = useApi();
  const auth = useAuth();
  return useQuery({
    queryKey: [...storyKeys.detail(id), auth.isAuthenticated],
    queryFn: ({ signal }) => api(StoryDetail, `/histoires/${id}`, { signal }),
  });
}

/** Chapitre publié, tel qu'on le lit. */
export function useChapter(storyId: string, chapterId: string) {
  const api = useApi();
  return useQuery({
    queryKey: storyKeys.chapter(storyId, chapterId),
    queryFn: ({ signal }) =>
      api(ChapterRead, `/histoires/${storyId}/chapitres/${chapterId}`, { signal }),
  });
}

/** Mes histoires (brouillons compris), par pages de 20, la plus récemment modifiée d'abord. */
export function useMyStories() {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: storyKeys.mine,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limite: '20' });
      if (pageParam) params.set('apres', pageParam);
      return api(StoryPage, `/moi/histoires?${params}`, { signal });
    },
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useDraft(storyId: string, chapterId: string) {
  const api = useApi();
  return useQuery({
    queryKey: storyKeys.draft(storyId, chapterId),
    queryFn: ({ signal }) =>
      api(ChapterDraft, `/histoires/${storyId}/chapitres/${chapterId}/brouillon`, { signal }),
    // Le texte en cours de saisie ne doit pas être remplacé par une relecture.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** Mutations de l'atelier ; chacune rafraîchit la fiche et la liste de l'atelier. */
export function useWriterActions(storyId?: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const refresh = (id: string) => {
    void queryClient.invalidateQueries({ queryKey: storyKeys.detail(id) });
    void queryClient.invalidateQueries({ queryKey: storyKeys.mine });
    void queryClient.invalidateQueries({ queryKey: storyKeys.public });
  };

  return {
    createStory: useMutation({
      mutationFn: (input: NewStory) =>
        api(StoryDetail, '/histoires', { method: 'POST', body: input }),
      onSuccess: (story) => refresh(story.id),
    }),
    updateStory: useMutation({
      mutationFn: (input: UpdateStory) =>
        api(StoryDetail, `/histoires/${storyId}`, { method: 'PATCH', body: input }),
      onSuccess: (story) => refresh(story.id),
    }),
    publishStory: useMutation({
      mutationFn: () => api(StoryDetail, `/histoires/${storyId}/publication`, { method: 'POST' }),
      onSuccess: (story) => refresh(story.id),
    }),
    createChapter: useMutation({
      mutationFn: (title: string) =>
        api(ChapterDraft, `/histoires/${storyId}/chapitres`, { method: 'POST', body: { title } }),
      onSuccess: () => refresh(storyId!),
    }),
    saveDraft: useMutation({
      mutationFn: (input: { chapterId: string; draft: unknown; version: number }) =>
        api(SavedDraft, `/histoires/${storyId}/chapitres/${input.chapterId}/brouillon`, {
          method: 'PUT',
          body: { draft: input.draft, version: input.version },
        }),
    }),
    renameChapter: useMutation({
      mutationFn: (input: { chapterId: string; title: string }) =>
        api(null, `/histoires/${storyId}/chapitres/${input.chapterId}`, {
          method: 'PATCH',
          body: { title: input.title },
        }),
      onSuccess: () => refresh(storyId!),
    }),
    publishChapter: useMutation({
      mutationFn: (chapterId: string) =>
        api(StoryDetail, `/histoires/${storyId}/chapitres/${chapterId}/publication`, {
          method: 'POST',
        }),
      onSuccess: () => refresh(storyId!),
    }),
  };
}
