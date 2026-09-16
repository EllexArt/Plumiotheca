import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import keycloak from './keycloak';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);

// Active/désactive Keycloak via variable d'env (par défaut: désactivé en dev)
const USE_KEYCLOAK = import.meta.env.VITE_ENABLE_KEYCLOAK === 'true';

if (!USE_KEYCLOAK) {
  // Mode démo/offline: on n'essaie pas de se connecter à Keycloak
  root.render(
    <React.StrictMode>
      {/* @ts-ignore - Mock keycloak for demo */}
      <App keycloak={{ tokenParsed: { preferred_username: 'DemoUser' }, logout: () => alert('Logout clicked') }} />
    </React.StrictMode>
  );
} else {
  // Mode Keycloak activé: on évite la redirection forcée avec 'check-sso'
  keycloak
    .init({ onLoad: 'check-sso', checkLoginIframe: false })
    .then(() => {
      root.render(
        <React.StrictMode>
          <App keycloak={keycloak} />
        </React.StrictMode>
      );
    })
    .catch((err) => {
      console.error("Échec de l'initialisation de Keycloak", err);
      // Fallback démo si Keycloak n'est pas joignable
      root.render(
        <React.StrictMode>
          {/* @ts-ignore - Mock keycloak for demo */}
          <App keycloak={{ tokenParsed: { preferred_username: 'DemoUser' }, logout: () => alert('Logout clicked') }} />
        </React.StrictMode>
      );
    });
}
