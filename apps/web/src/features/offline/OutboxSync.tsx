import { LibraryStatus } from '@plumiotheca/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useAuth } from 'react-oidc-context';
import { ApiError } from '../../shared/api/client';
import { useApi } from '../../shared/api/useApi';
import { isUnreachable } from './downloads';
import { chunks, pendingFor, settle } from './outbox';

/** Nouvel essai régulier, au cas où l'événement « online » ne viendrait pas. */
const RETRY_MS = 5 * 60_000;

/**
 * Envoie les lectures faites hors ligne (#35) dès que le réseau revient, au nom du compte
 * qui lisait seulement. Une réponse définitive (histoire disparue, bilan désactivé) retire
 * l'envoi ; une panne de réseau le garde pour plus tard.
 */
export function OutboxSync() {
  const api = useApi();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const account = auth.isAuthenticated ? auth.user?.profile.sub : undefined;
  const busy = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    flushRef.current = async () => {
      if (!account || busy.current || !navigator.onLine) return;
      const outbox = pendingFor(account);
      if (!outbox) return;
      busy.current = true;
      try {
        let sent = false;
        for (const [storyId, position] of Object.entries(outbox.positions)) {
          try {
            await api(LibraryStatus, `/moi/lectures/${storyId}/position`, {
              method: 'PUT',
              body: position,
            });
            sent = true;
          } catch (error) {
            if (isUnreachable(error) || !(error instanceof ApiError)) return;
          }
          settle(account, { storyId });
        }
        for (const seconds of chunks(outbox.seconds)) {
          try {
            await api(null, '/moi/bilan/temps', { method: 'POST', body: { seconds } });
          } catch (error) {
            if (isUnreachable(error) || !(error instanceof ApiError)) return;
            // Bilan désactivé entre-temps : ce temps ne doit pas être gardé.
            if (error.status === 409) {
              settle(account, { seconds: outbox.seconds });
              break;
            }
          }
          settle(account, { seconds });
        }
        if (sent) await queryClient.invalidateQueries({ queryKey: ['moi', 'lectures'] });
      } finally {
        busy.current = false;
      }
    };
  });

  useEffect(() => {
    if (!account) return;
    const flush = () => void flushRef.current();
    flush();
    window.addEventListener('online', flush);
    const timer = setInterval(flush, RETRY_MS);
    return () => {
      window.removeEventListener('online', flush);
      clearInterval(timer);
    };
  }, [account]);

  return null;
}
