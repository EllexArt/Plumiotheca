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
      // Une erreur de l'API (404, 403…) est une réponse, pas un incident réseau : pas de nouvel essai.
      retry: (failures, error) =>
        !(error instanceof ApiError && error.status < 500) && failures < 2,
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
