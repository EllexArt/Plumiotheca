# Plumiotheca-frontend

Architecture Micro-Frontend pour une plateforme de lecture et d'écriture (style Wattpad).

## Structure du Projet

Le projet utilise un Monorepo avec les **workspaces pnpm** (racine du dépôt) et **Vite Module Federation**.

- **apps/shell** (Port 5000) : L'application hôte qui gère le layout, l'authentification (Keycloak) et le routage.
- **apps/reader** (Port 5001) : Micro-frontend dédié à la lecture des histoires.
- **apps/editor** (Port 5002) : Micro-frontend dédié à l'écriture et à la publication.
- **libs/api-client** : Client typé de l'API backend, partagé par les trois applications.

## Pré-requis

- Node.js (v18+)
- Le backend Plumiotheca démarré (par défaut sur `http://localhost:3000`, voir le dépôt `Plumiotheca-backend`).
- Un serveur Keycloak (optionnel pour la démo, l'application fonctionne en mode dégradé si Keycloak est injoignable).

## Installation

À la racine du projet :
```bash
pnpm install
```

## Lancement

Pour lancer tous les micro-frontends en même temps :
```bash
pnpm dev
```

L'application sera disponible sur [http://localhost:5000](http://localhost:5000).

Attention : `pnpm dev` sert `reader` et `editor` depuis leur build (`vite preview`). Après une
modification dans un remote, il faut le reconstruire — ou lancer directement :

```bash
pnpm dev-full
```

## Connexion à l'API

Le client d'API vit dans `libs/api-client` et est résolu par un alias Vite (`@plumiotheca/api-client`)
dans les trois applications. Le shell est le seul à connaître Keycloak : il construit le client avec
le jeton courant et le transmet aux remotes via une prop `api`.

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `VITE_API_URL` | `http://localhost:3000` | URL du backend |
| `VITE_ENABLE_KEYCLOAK` | `false` | Active l'authentification Keycloak |

Sans Keycloak, l'application reste utilisable en lecture seule : les requêtes partent sans jeton,
donc la création d'histoire renvoie `401`. Le backend doit autoriser les origines `5000`, `5001` et
`5002` (variable `CORS_ORIGINS` côté API, valeur par défaut déjà correcte).

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
