import { MyAccount, type Appearance } from '@plumiotheca/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { myAccountKey, useMyAccount } from '../features/account/api';
import { useApi } from '../shared/api/useApi';
import { isPalette, type PaletteId } from './palettes';
import { useTheme, type ThemeChoice } from './theme';

/**
 * Apparence (#77) : ambiance et mode. Appliquée tout de suite sur cet appareil, et gardée
 * sur le compte quand on est connecté, pour la retrouver sur les autres appareils.
 */
export function useAppearance() {
  const theme = useTheme();
  const signedIn = useAuth().isAuthenticated;
  const account = useMyAccount();
  const api = useApi();
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (next: Appearance) =>
      api(MyAccount, '/moi/compte/apparence', { method: 'PUT', body: next }),
    onMutate: (next) =>
      queryClient.setQueryData<MyAccount>(myAccountKey, (old) =>
        old ? { ...old, appearance: next } : old,
      ),
    onSuccess: (saved) => queryClient.setQueryData(myAccountKey, saved),
  });

  const change = (next: { palette?: PaletteId; mode?: ThemeChoice }) => {
    const palette = next.palette ?? theme.palette;
    const mode = next.mode ?? theme.choice;
    theme.setPalette(palette);
    theme.setChoice(mode);
    if (signedIn && account.isSuccess) save.mutate({ palette, mode });
  };

  return {
    palette: theme.palette,
    mode: theme.choice,
    change,
    onAccount: signedIn && account.isSuccess,
    saveFailed: save.isError,
  };
}

/**
 * Applique sur cet appareil l'apparence gardée sur le compte, quand elle arrive (connexion,
 * autre appareil). Elle est aussi gardée localement : la visite suivante l'affiche dès le
 * premier rendu, sans flash.
 */
export function AppearanceSync() {
  const { setPalette, setChoice } = useTheme();
  const appearance = useMyAccount().data?.appearance;
  const palette = appearance?.palette;
  const mode = appearance?.mode;
  useEffect(() => {
    // Ambiance inconnue de ce site (plus ancienne ou plus récente) : on garde la sienne.
    if (palette && isPalette(palette)) setPalette(palette);
    if (mode) setChoice(mode);
  }, [palette, mode, setPalette, setChoice]);
  return null;
}
