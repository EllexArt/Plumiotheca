import { Problem } from '@plumiotheca/contracts';
import type { z } from 'zod';

/** Préfixe de l'API : relayée par Vite en développement, même domaine en production. */
const BASE = import.meta.env.VITE_API_URL ?? '/api';

/** Réponse d'erreur de l'API (RFC 9457), avec un message affichable. */
export class ApiError extends Error {
  constructor(readonly problem: Problem) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }

  get status(): number {
    return this.problem.status;
  }

  /** Identifiant stable du type d'erreur (« pseudonyme-indisponible »…). */
  get type(): string {
    return this.problem.type;
  }

  /** Message de validation rattaché à un champ (« handle », « chapters.0.title »). */
  fieldError(path: string): string | undefined {
    return this.problem.errors?.find((issue) => issue.path === path)?.message;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Jeton d'accès Keycloak ; absent pour une visite anonyme. */
  token?: string | undefined;
  signal?: AbortSignal | undefined;
}

const unreachable = (): Problem => ({
  type: 'reseau',
  title: 'Plumiotheca ne répond pas. Vérifiez votre connexion, puis réessayez.',
  status: 503,
});

/**
 * Appel de l'API. La réponse est vérifiée par le schéma des contrats partagés : un écart
 * entre l'API et le web se voit tout de suite, au lieu d'une donnée mal affichée.
 */
export async function request<S extends z.ZodType>(
  schema: S,
  path: string,
  options?: RequestOptions,
): Promise<z.output<S>>;
export async function request(schema: null, path: string, options?: RequestOptions): Promise<void>;
export async function request(
  schema: z.ZodType | null,
  path: string,
  { method = 'GET', body, token, signal }: RequestOptions = {},
): Promise<unknown> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      // Jamais de cookie : l'identité passe uniquement par le jeton.
      credentials: 'omit',
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ApiError(unreachable());
  }

  if (!response.ok) {
    const json: unknown = await response.json().catch(() => null);
    const problem = Problem.safeParse(json);
    // Relais ou passerelle sans réponse de l'API (redémarrage) : même message que le réseau.
    if (!problem.success && [502, 503, 504].includes(response.status)) {
      throw new ApiError({ ...unreachable(), status: response.status });
    }
    throw new ApiError(
      problem.success
        ? problem.data
        : {
            type: 'inattendu',
            title: 'Une erreur inattendue est survenue.',
            status: response.status,
          },
    );
  }
  if (response.status === 204 || schema === null) return undefined;
  const parsed = schema.safeParse(await response.json().catch(() => undefined));
  if (!parsed.success) {
    // Contrat non respecté (API plus récente ou plus ancienne que le web) : message lisible,
    // détail pour l'équipe dans la console seulement.
    console.error(`Réponse inattendue de l'API pour ${path}`, parsed.error.issues);
    throw new ApiError({
      type: 'reponse-inattendue',
      title:
        'Plumiotheca a répondu de façon inattendue. Rechargez la page ; si cela continue, signalez-le à l’équipe.',
      status: 500,
    });
  }
  return parsed.data;
}
