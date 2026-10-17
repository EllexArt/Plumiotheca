import { DEFAULT_READING, MyAccount, ReadingPreferences } from '@plumiotheca/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { useApi } from '../../shared/api/useApi';
import { myAccountKey, useMyAccount } from '../account/api';

/** Réglages choisis sans compte : sur cet appareil seulement. */
const KEY = 'plumiotheca.lecture';

function readDevice(): ReadingPreferences | null {
  try {
    return (
      ReadingPreferences.safeParse(JSON.parse(localStorage.getItem(KEY) ?? 'null')).data ?? null
    );
  } catch {
    return null;
  }
}

function writeDevice(preferences: ReadingPreferences | null) {
  try {
    if (preferences) localStorage.setItem(KEY, JSON.stringify(preferences));
    else localStorage.removeItem(KEY);
  } catch {
    // Stockage indisponible : les réglages valent pour cette visite seulement.
  }
}

/**
 * Réglages de lecture (#28) : ceux du compte quand on est connecté (retrouvés sur tous les
 * appareils), sinon ceux de l'appareil, sinon les réglages par défaut. Un changement
 * s'applique aussitôt ; sur le compte, il est enregistré en arrière-plan.
 */
export function useReadingPreferences() {
  const signedIn = useAuth().isAuthenticated;
  const account = useMyAccount();
  const api = useApi();
  const queryClient = useQueryClient();
  const [device, setDevice] = useState(readDevice);

  const save = useMutation({
    mutationFn: (next: ReadingPreferences | null) =>
      next
        ? api(MyAccount, '/moi/compte/lecture', { method: 'PUT', body: next })
        : api(MyAccount, '/moi/compte/lecture', { method: 'DELETE' }),
    // Affiché tout de suite, sans attendre la réponse.
    onMutate: (next) =>
      queryClient.setQueryData<MyAccount>(myAccountKey, (old) =>
        old ? { ...old, readingPreferences: next } : old,
      ),
    onSuccess: (saved) => queryClient.setQueryData(myAccountKey, saved),
    onError: () => void queryClient.invalidateQueries({ queryKey: myAccountKey }),
  });

  const onAccount = signedIn && account.isSuccess;
  const preferences =
    (onAccount ? account.data.readingPreferences : null) ?? device ?? DEFAULT_READING;

  const change = (next: ReadingPreferences | null) => {
    if (onAccount) {
      save.mutate(next);
    } else {
      writeDevice(next);
      setDevice(next);
    }
  };

  return { preferences, change, onAccount, saveFailed: save.isError };
}
