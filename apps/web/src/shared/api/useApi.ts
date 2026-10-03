import { useCallback } from 'react';
import { useAuth } from 'react-oidc-context';
import { useLocation } from 'react-router';
import type { z } from 'zod';
import type { SigninState } from '../../app/auth';
import { ApiError, request, type RequestOptions } from './client';

type Options = Omit<RequestOptions, 'token'>;

export interface Api {
  <S extends z.ZodType>(schema: S, path: string, options?: Options): Promise<z.output<S>>;
  (schema: null, path: string, options?: Options): Promise<void>;
}

/**
 * Renouvellement en cours, partagé : Keycloak fait tourner le jeton de rafraîchissement
 * (un seul usage). Deux requêtes refusées en même temps (réveil après une veille) ne
 * doivent pas le consommer deux fois, sinon la seconde échouerait et déconnecterait.
 */
let renewal: Promise<string | null> | null = null;

export function renewOnce(
  renew: () => Promise<{ access_token: string } | null>,
): Promise<string | null> {
  renewal ??= renew()
    .then((user) => user?.access_token ?? null)
    .catch(() => null)
    .finally(() => {
      renewal = null;
    });
  return renewal;
}

/**
 * Appels de l'API avec le jeton de la personne connectée. Jeton refusé (expiré pendant
 * une veille, par exemple) : un renouvellement silencieux partagé, puis un seul nouvel
 * essai ; en dernier recours, retour à la connexion sur la même page.
 */
export function useApi(): Api {
  const auth = useAuth();
  const location = useLocation();
  const token = auth.user?.access_token;

  const call = useCallback(
    async (schema: z.ZodType | null, path: string, options: Options = {}) => {
      const send = (jwt: string | undefined) =>
        request(schema as z.ZodType, path, { ...options, token: jwt });
      try {
        return await send(token);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 401 || !token) throw error;
        const renewed = await renewOnce(() => auth.signinSilent());
        if (renewed) return send(renewed);
        const state: SigninState = { returnTo: location.pathname + location.search };
        await auth.signinRedirect({ state });
        throw error;
      }
    },
    [auth, token, location.pathname, location.search],
  );
  return call as Api;
}
