import { MAX_READING_SECONDS, MyAccount, ReadingStats } from '@plumiotheca/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useApi } from '../../shared/api/useApi';
import { myAccountKey } from '../account/api';

const statsKey = ['moi', 'bilan'] as const;

/** Mon bilan de lecture (#34), s'il est activé. */
export function useReadingStats(enabled: boolean) {
  const api = useApi();
  return useQuery({
    queryKey: statsKey,
    enabled,
    queryFn: ({ signal }) => api(ReadingStats, '/moi/bilan', { signal }),
  });
}

/** Activer ou désactiver le bilan ; le désactiver efface le temps de lecture mesuré. */
export function useSetReadingStats() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (readingStats: boolean) =>
      api(MyAccount, '/moi/compte/bilan', { method: 'PUT', body: { readingStats } }),
    onSuccess: (account) => {
      queryClient.setQueryData(myAccountKey, account);
      queryClient.removeQueries({ queryKey: statsKey });
    },
  });
}

/** Sans geste (défilement, touche, toucher) depuis 2 minutes : on ne lit plus. */
const IDLE_SECONDS = 120;
/** Envoi du temps compté : toutes les minutes, et en quittant le chapitre. */
const SEND_EVERY_SECONDS = 60;

/**
 * Temps de lecture (#34) : compte les secondes où la page est visible et où la personne a
 * bougé dans les deux dernières minutes. Rien d'autre n'est envoyé que ce nombre ; le temps
 * des dernières secondes avant de fermer l'onglet peut se perdre.
 */
export function useReadingTimer(enabled: boolean) {
  const api = useApi();
  // Toujours le dernier client d'API (jeton renouvelé), sans relancer le minuteur.
  const send = useRef<(seconds: number) => void>(() => {});
  useEffect(() => {
    send.current = (seconds) => {
      void api(null, '/moi/bilan/temps', { method: 'POST', body: { seconds } }).catch(() => {
        // Temps perdu : jamais d'erreur affichée pour un bilan.
      });
    };
  });

  useEffect(() => {
    if (!enabled) return;
    let counted = 0;
    let elapsed = 0;
    // Secondes depuis le dernier geste.
    let idle = 0;
    const active = () => {
      idle = 0;
    };
    const flush = () => {
      const seconds = Math.min(Math.floor(counted), MAX_READING_SECONDS);
      counted = 0;
      if (seconds > 0) send.current(seconds);
    };
    const tick = setInterval(() => {
      idle += 1;
      if (document.visibilityState === 'visible' && idle <= IDLE_SECONDS) counted += 1;
      elapsed += 1;
      if (elapsed % SEND_EVERY_SECONDS === 0) flush();
    }, 1000);
    const events = ['scroll', 'keydown', 'pointerdown', 'touchstart'] as const;
    for (const event of events) window.addEventListener(event, active, { passive: true });
    document.addEventListener('visibilitychange', flush);
    return () => {
      clearInterval(tick);
      for (const event of events) window.removeEventListener(event, active);
      document.removeEventListener('visibilitychange', flush);
      flush();
    };
  }, [enabled]);
}

/** « 3 h 20 min », « 45 min », « moins d'une minute ». */
export function formatMinutes(minutes: number): string {
  if (minutes < 1) return 'moins d’une minute';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}
