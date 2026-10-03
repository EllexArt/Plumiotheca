import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from 'react-oidc-context';
import { RouterProvider } from 'react-router';
import { ApiError } from '../shared/api/client';
import { oidcSettings, returnToOf } from './auth';
import { router } from './router';
import { ThemeProvider } from './theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Nouvel essai seulement pour un incident passager (réseau, API indisponible) ; une
      // réponse de l'API (404, 403, réponse hors contrat…) ne changera pas en réessayant.
      retry: (failures, error) =>
        failures < 2 &&
        (!(error instanceof ApiError) ||
          error.type === 'reseau' ||
          [502, 503, 504].includes(error.status)),
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <AuthProvider
      {...oidcSettings}
      // Après Keycloak : retirer le code de l'adresse et rouvrir la page de départ.
      onSigninCallback={(user) => void router.navigate(returnToOf(user), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}
