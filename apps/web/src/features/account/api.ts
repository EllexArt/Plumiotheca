import {
  MAX_UPLOAD_BYTES,
  Media,
  UPLOAD_TYPES,
  UploadTicket,
  type MediaRejection,
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

/** Étapes de l'envoi d'une image, annoncées pendant l'attente. */
export type UploadPhase = 'envoi' | 'traitement' | 'enregistrement';

const REJECTIONS: Record<MediaRejection, string> = {
  format: 'Ce fichier n’est pas une image JPEG, PNG ou WebP.',
  taille: 'Cette image dépasse 10 Mo.',
  illisible: 'Cette image est abîmée ou trop grande pour être lue.',
  absent: 'L’image n’est pas arrivée : réessayez.',
};

/** Refus immédiat, avant tout envoi (le serveur vérifie de nouveau le contenu réel). */
export function checkImage(file: File): string | null {
  if (!(UPLOAD_TYPES as readonly string[]).includes(file.type)) return REJECTIONS.format;
  if (file.size > MAX_UPLOAD_BYTES) return REJECTIONS.taille;
  return null;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Attente du traitement : une minute au plus. */
const POLLS = 60;

/**
 * Nouvel avatar (#26) : autorisation de l'API, envoi direct du fichier vers le stockage,
 * traitement (type vérifié, ré-encodage sans métadonnées), puis choix comme avatar.
 */
export function useSetAvatar(onPhase: (phase: UploadPhase) => void) {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      onPhase('envoi');
      const ticket = await api(UploadTicket, '/medias', {
        method: 'POST',
        body: { kind: 'avatar' },
      });
      const form = new FormData();
      for (const [name, value] of Object.entries(ticket.fields)) form.append(name, value);
      form.append('file', file);
      const sent = await fetch(ticket.url, { method: 'POST', body: form }).catch(() => null);
      if (!sent?.ok) throw new Error('L’image n’a pas pu être envoyée : réessayez.');

      onPhase('traitement');
      await api(Media, `/medias/${ticket.id}/traitement`, { method: 'POST' });
      let media: Media | undefined;
      for (let i = 0; i < POLLS; i++) {
        media = await api(Media, `/medias/${ticket.id}`);
        if (media.status === 'ready' || media.status === 'rejected') break;
        await pause(1000);
      }
      if (media?.status === 'rejected' && media.rejection) {
        throw new Error(REJECTIONS[media.rejection]);
      }
      if (media?.status !== 'ready') {
        throw new Error('Le traitement de l’image prend trop de temps : réessayez plus tard.');
      }

      onPhase('enregistrement');
      return api(MyAccount, '/moi/compte/avatar', {
        method: 'PUT',
        body: { mediaId: ticket.id },
      });
    },
    onSuccess: (account) => {
      queryClient.setQueryData(myAccountKey, account);
      void queryClient.invalidateQueries({ queryKey: ['profils'] });
    },
  });
}

export function useRemoveAvatar() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api(MyAccount, '/moi/compte/avatar', { method: 'DELETE' }),
    onSuccess: (account) => {
      queryClient.setQueryData(myAccountKey, account);
      void queryClient.invalidateQueries({ queryKey: ['profils'] });
    },
  });
}
