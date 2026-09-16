import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Keycloak from 'keycloak-js';
import type { ApiClient } from '@plumiotheca/api-client';
import RemoteErrorBoundary from './RemoteErrorBoundary';

// Importations dynamiques des microfrontends
// @ts-ignore
const ReaderApp = React.lazy(() => import('reader/App'));
// @ts-ignore
const EditorApp = React.lazy(() => import('editor/App'));

interface AppProps {
  keycloak: Keycloak;
  api: ApiClient;
  isAuthenticated: boolean;
}

const App: React.FC<AppProps> = ({ keycloak, api, isAuthenticated }) => {
  return (
    <BrowserRouter>
      <div style={{ fontFamily: 'sans-serif' }}>
        <header style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          padding: '10px 20px', 
          backgroundColor: '#2c3e50', 
          color: 'white',
          alignItems: 'center'
        }}>
          <h1>Plumiotheca</h1>
          <nav>
            <ul style={{ display: 'flex', listStyle: 'none', gap: '20px' }}>
              <li><Link to="/" style={{ color: 'white', textDecoration: 'none' }}>Accueil</Link></li>
              <li><Link to="/reader" style={{ color: 'white', textDecoration: 'none' }}>Lire</Link></li>
              <li><Link to="/editor" style={{ color: 'white', textDecoration: 'none' }}>Écrire</Link></li>
            </ul>
          </nav>
          <div>
            <span>Bienvenue, {keycloak.tokenParsed?.preferred_username || 'Invité'}</span>
            {isAuthenticated ? (
              <button 
                onClick={() => keycloak.logout()}
                style={{ marginLeft: '10px', padding: '5px 10px', cursor: 'pointer' }}
              >
                Déconnexion
              </button>
            ) : (
              <button
                onClick={() => keycloak.login?.()}
                style={{ marginLeft: '10px', padding: '5px 10px', cursor: 'pointer' }}
              >
                Connexion
              </button>
            )}
          </div>
        </header>

        <main style={{ padding: '20px' }}>
          <Suspense fallback={<div>Chargement du module...</div>}>
            <Routes>
              <Route path="/" element={
                <div>
                  <h2>Bienvenue sur Plumiotheca</h2>
                  <p>La plateforme pour lire, écrire et partager vos histoires.</p>
                </div>
              } />
              <Route path="/reader/*" element={
                <RemoteErrorBoundary name="Lecture">
                  <ReaderApp api={api} />
                </RemoteErrorBoundary>
              } />
              <Route path="/editor/*" element={
                <RemoteErrorBoundary name="Écriture">
                  <EditorApp api={api} isAuthenticated={isAuthenticated} />
                </RemoteErrorBoundary>
              } />
            </Routes>
          </Suspense>
        </main>
      </div>
    </BrowserRouter>
  );
};

export default App;
