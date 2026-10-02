# Plumiotheca Backend

A platform that allows you to read, write, and share about your favorite universes and stories. Who knows, other features may come later.

## Installation

> Prototype Express en cours de réécriture (NestJS, jalon M1). Ne pas déployer.

```bash
pnpm infra:setup && pnpm infra:up   # depuis la racine : base, Keycloak, etc. (voir infra/README.md)
pnpm dev:api                        # lit apps/api/.env créé par infra:setup
```

Base de données (outils comme DBeaver ou WebStorm) : `localhost:5433`, base `plumiotheca`, utilisateur `plumiotheca`, mot de passe `POSTGRES_PASSWORD` dans `infra/.env`.

## Testing

The project uses Jest for unit testing.

```bash
pnpm test
```

## Documentation API (Swagger)

La documentation interactive de l'API est disponible à l'adresse suivante lorsque le serveur est lancé :

- `http://localhost:3000/api-docs`

### Authentification dans Swagger

Pour tester les routes protégées (`Users`, `Stories` (POST/PATCH/DELETE)), vous devez :

1. **Obtenir un Token** : Connectez-vous via votre application front-end ou récupérez un jeton d'accès directement depuis Keycloak.
2. **Utiliser le bouton Authorize** : Dans l'interface Swagger, cliquez sur le bouton vert **"Authorize"** en haut à droite.
3. **Coller le Jeton** : Entrez votre jeton JWT dans le champ `Value` (sans le préfixe "Bearer", Swagger l'ajoute automatiquement car il est configuré en type `http` scheme `bearer`).
4. **Valider** : Cliquez sur `Authorize` puis `Close`. Les cadenas sur les routes protégées devraient maintenant être fermés.

### Postman (Collection prête à l'emploi)

Deux fichiers sont fournis dans le dossier `postman/` pour faciliter les tests et la récupération du token Keycloak :

- `postman/Plumiotheca.postman_collection.json`
- `postman/Plumiotheca.postman_environment.json`

Procédure d'utilisation :

1. Ouvrez Postman > Import > sélectionnez les deux fichiers ci-dessus.
2. Sélectionnez l'environnement `Plumiotheca Local` importé.
3. Renseignez `username` et `password` dans l'environnement (vos identifiants Keycloak).
4. Exécutez la requête `Auth - Get Token (Keycloak)` : le script stocke automatiquement `access_token` et `refresh_token` dans l'environnement.
5. Lancez les requêtes d'API (ex.: `Users - Get My Profile`, `Stories - List`, `Stories - Create`). L'authentification Bearer est appliquée automatiquement via la variable `{{access_token}}` au niveau de la collection.

Remarques :

- URL Keycloak par défaut: `http://localhost:8080`, realm: `plumiotheca`, client: `plumiotheca-backend` (modifiables dans l'environnement).
- L'API est accessible via `{{base_url}}` (par défaut `http://localhost:3000`).

## Security & User Management

### Authentication (Keycloak)

Authentication is handled by Keycloak. Protected routes are secured using the `keycloak.protect()` middleware.

### User Synchronization

The API uses a synchronization mechanism:

- When a user authenticates via Keycloak and calls a protected route, the `authMiddleware` checks if the user exists in the local PostgreSQL database (using the Keycloak `sub` as a unique identifier).
- If the user doesn't exist, it is automatically created in the local database with information from the Keycloak token (`email`, `username`).
- The local user object is then attached to the request (`req.user`), allowing you to handle application-specific logic (profiles, stories, follows) while keeping identity management in Keycloak.

### User API Endpoints

- `GET /api/users/profile`: Returns the authenticated user's profile (requires authentication).
- `PATCH /api/users/profile`: Updates the authenticated user's profile (`displayName`, `bio`, `avatarUrl`).
- `GET /api/users/:username`: Publicly retrieves a user's profile by their username.

### Stories & Chapters API Endpoints

- `GET /api/stories`: Returns all stories (query params: `published=true/false`, `tag=name`).
- `GET /api/stories/:id`: Returns a specific story with its chapters and author.
- `POST /api/stories`: Creates a new story (requires authentication). Body: `{ title, description, coverUrl, tags: ["tag1", "tag2"], status: "draft/published" }`.
- `PATCH /api/stories/:id`: Updates a story (requires ownership).
- `DELETE /api/stories/:id`: Deletes a story (requires ownership).
- `GET /api/stories/:id/chapters`: Returns all chapters for a story.
- `POST /api/stories/:id/chapters`: Adds a chapter to a story (requires ownership). Body: `{ title, content, order }`.

### Environment Variables

- `PORT`: Port of the API (default: 3000)
- `CORS_ORIGINS`: Comma-separated list of origins allowed to call the API (default: `http://localhost:5000,http://localhost:5001,http://localhost:5002`, i.e. the three micro-frontends)
- `KEYCLOAK_REALM`: Keycloak realm name (default: plumiotheca)
- `KEYCLOAK_AUTH_SERVER_URL`: Keycloak URL (default: http://localhost:8080)
- `KEYCLOAK_CLIENT_ID`: Keycloak client ID (`api`)
- `DB_HOST`: Database host (default: localhost)
- `DB_PORT`: Database port (`5433` avec l'infra de dev)
- `DB_USERNAME`: Database username (default: plumiotheca)
- `DB_PASSWORD`: Database password (default: plumiotheca)
- `DB_NAME`: Database name (default: plumiotheca)

### Identifiants de développement

Tous générés aléatoirement par `pnpm infra:setup` dans `infra/.env` et `apps/api/.env` (jamais commités).
