import {
  AcceptCharter,
  ChangeHandle,
  FirstVisit,
  HandleAvailability,
  MyAccount,
  PublicProfile,
  UpdateProfile,
  type AccountStep,
} from '@plumiotheca/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from 'react-oidc-context';
import { useApi } from '../../shared/api/useApi';

export const myAccountKey = ['moi', 'compte'] as const;

/** Mon compte (étape d'accueil, pseudonyme…), seulement une fois connecté. */
export function useMyAccount() {
  const auth = useAuth();
  const api = useApi();
  return useQuery({
    queryKey: myAccountKey,
    queryFn: ({ signal }) => api(MyAccount, '/moi/compte', { signal }),
    enabled: auth.isAuthenticated,
    staleTime: 5 * 60_000,
  });
}

/** Page où chaque étape d'accueil se franchit. */
export const stepPath: Record<Exclude<AccountStep, 'ready'>, string> = {
  'first-visit': '/bienvenue',
  charter: '/charte/accepter',
  'age-locked': '/compte-verrouille',
};

export function useFirstVisit() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: FirstVisit) =>
      api(MyAccount, '/moi/compte/premiere-visite', {
        method: 'POST',
        body: FirstVisit.parse(input),
      }),
    onSuccess: (account) => queryClient.setQueryData(myAccountKey, account),
  });
}

export function useAcceptCharter() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AcceptCharter) =>
      api(MyAccount, '/moi/compte/charte', { method: 'POST', body: input }),
    onSuccess: (account) => queryClient.setQueryData(myAccountKey, account),
  });
}

/** Le pseudonyme est-il libre ? (aide pendant la saisie, la réponse finale reste celle de l'envoi) */
export function useHandleAvailability() {
  const api = useApi();
  return (handle: string, signal?: AbortSignal) =>
    api(HandleAvailability, `/pseudonymes/${encodeURIComponent(handle)}/disponibilite`, {
      signal,
    }).then((r) => r.available);
}

/** Profil public d'une personne (ni e-mail, ni âge, ni identifiant Keycloak). */
export function usePublicProfile(handle: string) {
  const api = useApi();
  return useQuery({
    queryKey: ['profils', handle],
    queryFn: ({ signal }) =>
      api(PublicProfile, `/pseudonymes/${encodeURIComponent(handle)}`, { signal }),
  });
}

/** Nom affiché, pronoms, présentation (null efface). */
export function useUpdateProfile() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfile) =>
      api(MyAccount, '/moi/compte/profil', { method: 'PATCH', body: UpdateProfile.parse(input) }),
    onSuccess: (account) => {
      queryClient.setQueryData(myAccountKey, account);
      void queryClient.invalidateQueries({ queryKey: ['profils'] });
    },
  });
}

/** Nouveau pseudonyme (une fois par mois ; l'ancien n'est réattribuable qu'après 90 jours). */
export function useChangeHandle() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeHandle) =>
      api(MyAccount, '/moi/compte/pseudonyme', { method: 'PUT', body: ChangeHandle.parse(input) }),
    onSuccess: (account) => {
      queryClient.setQueryData(myAccountKey, account);
      void queryClient.invalidateQueries({ queryKey: ['profils'] });
      void queryClient.invalidateQueries({ queryKey: ['histoires'] });
    },
  });
}
