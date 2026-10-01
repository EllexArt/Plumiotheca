import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import keycloak from './keycloak';
import { createApi } from './api';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

const root = ReactDOM.createRoot(rootElement);

// Active/désactive Keycloak via variable d'env (par défaut: désactivé en dev)
const USE_KEYCLOAK = import.meta.env.VITE_ENABLE_KEYCLOAK === 'true';

// Mode démo/offline: les appels API partent sans jeton, donc en lecture seule.
const demoKeycloak = {
  tokenParsed: { preferred_username: 'DemoUser' },
  authenticated: false,
  logout: () => alert('Logout clicked')
};

const renderDemo = () => {
  root.render(
    <React.StrictMode>
      {/* @ts-ignore - Mock keycloak for demo */}
      <App keycloak={demoKeycloak} api={createApi(() => undefined)} isAuthenticated={false} />
    </React.StrictMode>
  );
};

if (!USE_KEYCLOAK) {
  renderDemo();
} else {
  // Mode Keycloak activé: on évite la redirection forcée avec 'check-sso'
  keycloak
    .init({ onLoad: 'check-sso', checkLoginIframe: false })
    .then((authenticated) => {
      root.render(
        <React.StrictMode>
          <App
            keycloak={keycloak}
            api={createApi(() => keycloak.token)}
            isAuthenticated={authenticated}
          />
        </React.StrictMode>
      );
    })
    .catch((err) => {
      console.error("Échec de l'initialisation de Keycloak", err);
      // Fallback démo si Keycloak n'est pas joignable
      renderDemo();
    });
}
