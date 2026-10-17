import {
  ContentWarning,
  MajorWarning,
  MyAccount,
  ReadingLimits,
  normalizeTag,
  type StorySummary,
} from '@plumiotheca/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { useAuth } from 'react-oidc-context';
import { useApi } from '../../shared/api/useApi';
import { myAccountKey, useMyAccount } from '../account/api';
import { contentWarningLabel, warningLabel } from './labels';

/** Mes limites (#152, #81) : avertissements facultatifs, avertissements majeurs, tags. */
export type Limits = ReadingLimits;

const NONE: Limits = { hiddenContentWarnings: [], hiddenMajorWarnings: [], hiddenTags: [] };

/** Choix d'une visite sans compte : pour la session de l'onglet seulement. */
const KEY = 'plumiotheca.limites';
const listeners = new Set<() => void>();
let cached: { raw: string | null; value: Limits } = { raw: null, value: NONE };

function parse(raw: string | null): Limits {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    // Ancien format (#152) : la liste des avertissements facultatifs seule.
    if (Array.isArray(value)) {
      return { ...NONE, hiddenContentWarnings: ContentWarning.array().catch([]).parse(value) };
    }
    return ReadingLimits.safeParse(value).data ?? NONE;
  } catch {
    return NONE;
  }
}

function readSession(): Limits {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(KEY);
  } catch {
    return NONE;
  }
  // Même texte, même objet : useSyncExternalStore exige une valeur stable.
  if (raw !== cached.raw) cached = { raw, value: parse(raw) };
  return cached.value;
}

const isEmpty = (limits: Limits) =>
  !limits.hiddenContentWarnings.length &&
  !limits.hiddenMajorWarnings.length &&
  !limits.hiddenTags.length;

function writeSession(next: Limits) {
  try {
    if (isEmpty(next)) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Stockage indisponible : le choix ne survivra pas à la page.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Sans doublon, dans l'ordre des listes ; tags sous leur forme normalisée. */
function normalize(limits: Limits): Limits {
  return {
    hiddenContentWarnings: ContentWarning.options.filter((w) =>
      limits.hiddenContentWarnings.includes(w),
    ),
    hiddenMajorWarnings: MajorWarning.options.filter((w) => limits.hiddenMajorWarnings.includes(w)),
    hiddenTags: [...new Set(limits.hiddenTags.map(normalizeTag).filter(Boolean))],
  };
}

/**
 * Mes limites, appliquées partout (Explorer, recherche, profils, sélections) : sur le compte
 * quand on est connecté (permanentes, retrouvées partout), pour la session de l'onglet sinon.
 */
export function useLimits() {
  const signedIn = useAuth().isAuthenticated;
  const account = useMyAccount();
  const api = useApi();
  const queryClient = useQueryClient();
  const session = useSyncExternalStore(subscribe, readSession, () => NONE);

  const save = useMutation({
    mutationFn: (next: Limits) =>
      api(MyAccount, '/moi/compte/limites', { method: 'PUT', body: next }),
    // Appliqué tout de suite aux listes, sans attendre la réponse.
    onMutate: (next) =>
      queryClient.setQueryData<MyAccount>(myAccountKey, (old) =>
        old ? { ...old, limits: isEmpty(next) ? null : next } : old,
      ),
    onSuccess: (saved) => queryClient.setQueryData(myAccountKey, saved),
    onError: () => void queryClient.invalidateQueries({ queryKey: myAccountKey }),
  });

  const onAccount = signedIn && account.isSuccess;
  const limits = onAccount ? (account.data.limits ?? NONE) : session;
  const change = (patch: Partial<Limits>) => {
    const next = normalize({ ...limits, ...patch });
    if (onAccount) save.mutate(next);
    else writeSession(next);
  };
  return {
    limits,
    change,
    active: !isEmpty(limits),
    onAccount,
    /** Compte connecté, encore en chargement : les listes attendent ses limites. */
    pending: signedIn && account.isPending,
    saveFailed: save.isError,
  };
}

/** Pourquoi une histoire est masquée d'habitude (vide : elle ne l'est pas). */
export function limitReasons(story: StorySummary, limits: Limits): string[] {
  const tags = new Set(limits.hiddenTags);
  return [
    ...(story.majorWarnings ?? [])
      .filter((w) => limits.hiddenMajorWarnings.includes(w))
      .map((w) => warningLabel[w]),
    ...story.contentWarnings
      .filter((w) => limits.hiddenContentWarnings.includes(w))
      .map((w) => contentWarningLabel[w]),
    ...story.tags.filter((t) => tags.has(normalizeTag(t))).map((t) => `tag « ${t} »`),
  ];
}
