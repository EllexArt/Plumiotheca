# Plumiotheca-frontend

Architecture Micro-Frontend pour une plateforme de lecture et d'écriture (style Wattpad).

## Structure du Projet

Le projet utilise un Monorepo avec les **npm workspaces** et **Vite Module Federation**.

- **apps/shell** (Port 5000) : L'application hôte qui gère le layout, l'authentification (Keycloak) et le routage.
- **apps/reader** (Port 5001) : Micro-frontend dédié à la lecture des histoires.
- **apps/editor** (Port 5002) : Micro-frontend dédié à l'écriture et à la publication.

## Pré-requis

- Node.js (v18+)
- Un serveur Keycloak (optionnel pour la démo, l'application fonctionne en mode dégradé si Keycloak est injoignable).

## Installation

À la racine du projet :
```bash
npm install
```

## Lancement

Pour lancer tous les micro-frontends en même temps :
```bash
npm run dev
```

L'application sera disponible sur [http://localhost:5000](http://localhost:5000).

## Configuration Keycloak

Le fichier de configuration se trouve dans `apps/shell/src/keycloak.ts`. Par défaut, il tente de se connecter à :
- URL : `http://localhost:8080`
- Realm : `plumiotheca`
- Client ID : `frontend-shell`

Assurez-vous d'autoriser les origines `http://localhost:5000` (et les ports 5001, 5002) dans la configuration Web Origin de votre client Keycloak.

## Technologies Utilisées

- **React 19**
- **TypeScript**
- **Vite**
- **Vite Module Federation** (@originjs/vite-plugin-federation)
- **Keycloak JS**
- **React Router**
