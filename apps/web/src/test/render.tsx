import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, vi } from 'vitest';
import { routes } from '../app/router';
import { ThemeProvider } from '../app/theme';

/** État de connexion simulé (react-oidc-context est remplacé dans les tests). */
export const auth = {
  isAuthenticated: false,
  isLoading: false,
  error: undefined as Error | undefined,
  user: null as { access_token: string } | null,
  signinRedirect: vi.fn(() => Promise.resolve()),
  signinSilent: vi.fn(() => Promise.resolve(null)),
  signoutRedirect: vi.fn(() => Promise.resolve()),
};

export function signedIn() {
  auth.isAuthenticated = true;
  auth.user = { access_token: 'jeton-de-test' };
}

export function signedOut() {
  auth.isAuthenticated = false;
  auth.user = null;
}

type Handler = (url: string, init: RequestInit) => { status?: number; body?: unknown } | undefined;

/** Fausse API : chaque appel passe par `handler` ; les appels sont gardés pour les vérifier. */
export function mockApi(handler: Handler) {
  const calls: { url: string; method: string; body: unknown; auth: string | undefined }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init: RequestInit = {}) => {
      const headers = (init.headers ?? {}) as Record<string, string>;
      calls.push({
        url: input,
        method: init.method ?? 'GET',
        body: init.body ? JSON.parse(String(init.body)) : undefined,
        auth: headers.Authorization,
      });
      const reply = handler(input, init) ?? {
        status: 404,
        body: { type: 'introuvable', title: 'Introuvable', status: 404 },
      };
      const status = reply.status ?? 200;
      return Promise.resolve(
        new Response(status === 204 ? null : JSON.stringify(reply.body ?? {}), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
  return calls;
}

/** Monte l'application complète (vrai routeur) sur une adresse donnée. */
export function renderApp(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { ...view, router, queryClient };
}

/** Aucune violation axe-core (le contraste est vérifié à part : jsdom ne calcule pas les styles). */
export async function expectAccessible(container: Element) {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(results.violations.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);
}

export const account = (overrides: Record<string, unknown> = {}) => ({
  step: 'ready',
  handle: 'ilse',
  displayName: null,
  pronouns: null,
  bio: null,
  ageBand: '18+',
  charterVersion: '1',
  handleChangeableFrom: null,
  ...overrides,
});
