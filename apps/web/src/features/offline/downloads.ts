import { ChapterRead, StoryDetail } from '@plumiotheca/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../../shared/api/client';
import { useApi } from '../../shared/api/useApi';
import {
  downloadedStories,
  downloadedStory,
  removeAllStories,
  removeStory,
  saveStory,
} from './store';

export const downloadKeys = {
  all: ['hors-ligne'] as const,
  story: (id: string) => ['hors-ligne', id] as const,
};

/** Le réseau (ou l'API) ne répond pas : c'est le moment de lire la copie téléchargée. */
export const isUnreachable = (error: unknown) =>
  error instanceof ApiError && (error.type === 'reseau' || [502, 503, 504].includes(error.status));

/** Histoires téléchargées sur cet appareil. */
export function useDownloads() {
  return useQuery({ queryKey: downloadKeys.all, queryFn: downloadedStories });
}

/** Cette histoire est-elle téléchargée ? (null : non.) */
export function useDownload(storyId: string) {
  return useQuery({
    queryKey: downloadKeys.story(storyId),
    queryFn: async () => (await downloadedStory(storyId)) ?? null,
  });
}

/**
 * Télécharge une histoire : sa fiche, puis chaque chapitre publié, un par un (progression
 * annoncée). Rien n'est gardé si un chapitre manque : une histoire est complète ou absente.
 */
export function useDownloadStory(storyId: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const mutation = useMutation({
    mutationFn: async () => {
      const story = await api(StoryDetail, `/histoires/${storyId}`);
      const published = story.chapters.filter((c) => c.status === 'published');
      const chapters: ChapterRead[] = [];
      setProgress({ done: 0, total: published.length });
      for (const summary of published) {
        chapters.push(await api(ChapterRead, `/histoires/${storyId}/chapitres/${summary.id}`));
        setProgress({ done: chapters.length, total: published.length });
      }
      await saveStory(story, chapters);
      // Demande à garder ces données même quand l'appareil manque de place (sans garantie).
      await navigator.storage?.persist?.().catch(() => false);
    },
    onSettled: async () => {
      setProgress(null);
      await queryClient.invalidateQueries({ queryKey: downloadKeys.all });
    },
  });
  return { ...mutation, progress };
}

export function useRemoveDownload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (storyId?: string) => (storyId ? removeStory(storyId) : removeAllStories()),
    onSettled: () => queryClient.invalidateQueries({ queryKey: downloadKeys.all }),
  });
}

const size = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** « 340 ko », « 1,2 Mo ». */
export function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${size.format(Math.max(1, Math.round(bytes / 1000)))} ko`;
  return `${size.format(bytes / 1_000_000)} Mo`;
}
