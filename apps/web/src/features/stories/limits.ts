import { ContentWarning, MyAccount } from '@plumiotheca/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { useAuth } from 'react-oidc-context';
import { useApi } from '../../shared/api/useApi';
import { myAccountKey, useMyAccount } from '../account/api';

/** Choix d'une visite sans compte : pour la session de l'onglet seulement (#152). */
const KEY = 'plumiotheca.limites';
const listeners = new Set<() => void>();
const NONE: ContentWarning[] = [];
let cached: { raw: string | null; value: ContentWarning[] } = { raw: null, value: NONE };

function parse(raw: string | null): ContentWarning[] {
  try {
    return ContentWarning.array().safeParse(JSON.parse(raw ?? '[]')).data ?? NONE;
  } catch {
    return NONE;
  }
}

function readSession(): ContentWarning[] {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    return NONE;
  }
  // Même texte, même tableau : useSyncExternalStore exige une valeur stable.
  if (raw !== cached.raw) cached = { raw, value: parse(raw) };
  return cached.value;
}

function writeSession(next: ContentWarning[]) {
  try {
    if (next.length) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Stockage indisponible : le choix ne survivra pas à la page.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * Avertissements facultatifs masqués partout (#152, « Mes limites ») : sur le compte quand
 * on est connecté (retrouvés partout), pour la session de l'onglet sinon. Toutes les listes
 * et la recherche les appliquent.
 */
export function useLimits() {
  const signedIn = useAuth().isAuthenticated;
  const account = useMyAccount();
  const api = useApi();
  const queryClient = useQueryClient();
  const session = useSyncExternalStore(subscribe, readSession, () => NONE);

  const save = useMutation({
    mutationFn: (hidden: ContentWarning[]) =>
      api(MyAccount, '/moi/compte/limites', {
        method: 'PUT',
        body: { hiddenContentWarnings: hidden },
      }),
    // Appliqué tout de suite aux listes, sans attendre la réponse.
    onMutate: (hidden) =>
      queryClient.setQueryData<MyAccount>(myAccountKey, (old) =>
        old ? { ...old, limits: hidden.length ? { hiddenContentWarnings: hidden } : null } : old,
      ),
    onSuccess: (saved) => queryClient.setQueryData(myAccountKey, saved),
    onError: () => void queryClient.invalidateQueries({ queryKey: myAccountKey }),
  });

  const onAccount = signedIn && account.isSuccess;
  const hidden = onAccount ? (account.data.limits?.hiddenContentWarnings ?? NONE) : session;
  // Sans doublon, dans l'ordre de la liste des avertissements.
  const change = (next: ContentWarning[]) => {
    const ordered = ContentWarning.options.filter((w) => next.includes(w));
    if (onAccount) save.mutate(ordered);
    else writeSession(ordered);
  };
  return {
    hidden,
    change,
    onAccount,
    /** Compte connecté, encore en chargement : les listes attendent ses limites. */
    pending: signedIn && account.isPending,
    saveFailed: save.isError,
  };
}
