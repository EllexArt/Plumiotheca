// Polices auto-hébergées : aucune requête vers un service tiers (pas de traceur).
import '@fontsource/young-serif/400.css';
// Literata avec taille optique (comme les maquettes) et graisse variables.
import '@fontsource-variable/literata/opsz.css';
import '@fontsource-variable/literata/opsz-italic.css';
import '@fontsource-variable/figtree/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
