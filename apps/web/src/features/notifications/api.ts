import {
  MyAccount,
  NotificationPage,
  UnreadNotifications,
  type EmailDigest,
} from '@plumiotheca/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'react-oidc-context';
import { useApi } from '../../shared/api/useApi';
import { myAccountKey, useMyAccount } from '../account/api';

const keys = {
  all: ['moi', 'notifications'] as const,
  unread: ['moi', 'notifications', 'non-lues'] as const,
};

/** Relecture du nombre de non lues : toutes les 5 minutes, et au retour sur l’onglet. */
const UNREAD_EVERY_MS = 5 * 60_000;

/** Nombre de notifications non lues (#33) ; rien sans compte prêt. */
export function useUnreadNotifications() {
  const api = useApi();
  const signedIn = useAuth().isAuthenticated;
  const account = useMyAccount();
  return useQuery({
    queryKey: keys.unread,
    enabled: signedIn && account.data?.step === 'ready',
    refetchInterval: UNREAD_EVERY_MS,
    queryFn: async ({ signal }) =>
      (await api(UnreadNotifications, '/moi/notifications/non-lues', { signal })).unread,
  });
}

/** Mes notifications, la plus récente d’abord, par pages de 20. */
export function useNotifications() {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: keys.all,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api(
        NotificationPage,
        `/moi/notifications${pageParam ? `?apres=${encodeURIComponent(pageParam)}` : ''}`,
        { signal },
      ),
    getNextPageParam: (last) => last.nextCursor,
  });
}

/** Marque comme lue une notification (`id`), ou toutes (sans `id`). */
export function useMarkRead() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id?: string) =>
      api(null, id ? `/moi/notifications/${id}/lue` : '/moi/notifications/tout-lu', {
        method: 'POST',
      }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  });
}

/** E-mail récapitulatif (#33) : jamais, chaque jour, chaque semaine. */
export function useSetEmailDigest() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (emailDigest: EmailDigest) =>
      api(MyAccount, '/moi/compte/notifications', { method: 'PUT', body: { emailDigest } }),
    onSuccess: (account) => queryClient.setQueryData(myAccountKey, account),
  });
}
