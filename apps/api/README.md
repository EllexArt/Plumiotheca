# API Plumiotheca

NestJS 12 (ESM), Node 24. Architecture cible : [docs/architecture.md](../../docs/architecture.md).

> Squelette en construction (jalon M1) : santé, erreurs, journaux et sécurité HTTP. Ne pas déployer.

## Lancer

Depuis la racine du dépôt :

```bash
pnpm infra:setup && pnpm infra:up   # une fois : base, Keycloak, etc. (voir infra/README.md)
pnpm dev:api                        # http://localhost:3000, lit apps/api/.env
```

- Santé : `GET http://localhost:3000/api/health`
- Documentation OpenAPI (hors production uniquement) : `http://localhost:3000/api/docs`, JSON sur `/api/docs-json`

## Tester

```bash
pnpm --filter @plumiotheca/api test        # Vitest (SWC pour les décorateurs)
pnpm --filter @plumiotheca/api typecheck
```

## Conventions

- **Entrées** : chaque corps, paramètre ou requête est déclaré avec un schéma zod de `@plumiotheca/contracts`, par exemple `@Body({ schema: NewStory })`. Un champ inconnu est refusé (400).
- **Erreurs** : format `application/problem+json` (schéma `Problem`). Pour un message destiné à la personne, lever `ApiProblem` ; toute autre erreur renvoie un titre générique, sans détail interne.
- **Journaux** : JSON (pino), lisibles en développement. Les requêtes sont journalisées en liste blanche (méthode, chemin sans paramètres, statut) ; e-mails, mots de passe, jetons, cookies, contenus et paramètres SQL sont masqués. `X-Request-Id` relie une erreur à ses journaux.
- **Sécurité HTTP** : Helmet (CSP `default-src 'none'`), CORS limité à `CORS_ORIGINS`, sans cookie ; corps JSON limité à 1 Mo ; limitation de débit par adresse IP (`RATE_LIMIT_PER_MINUTE`).

## Configuration

Validée au démarrage par `src/config/env.ts` : l'API s'arrête avec la liste des variables en cause (sans leur valeur).

| Variable                | Défaut                  | Rôle                                                      |
| ----------------------- | ----------------------- | --------------------------------------------------------- |
| `NODE_ENV`              | `development`           | `production` désactive la documentation OpenAPI           |
| `HOST`                  | `127.0.0.1`             | `0.0.0.0` dans l'image Docker                             |
| `PORT`                  | `3000`                  |                                                           |
| `LOG_LEVEL`             | `info`                  | niveau pino                                               |
| `CORS_ORIGINS`          | origines locales de dev | liste séparée par des virgules, obligatoire en production |
| `TRUST_PROXY`           | `0`                     | nombre de proxys inverses devant l'API                    |
| `RATE_LIMIT_PER_MINUTE` | `120`                   | requêtes par minute et par adresse IP                     |

Les autres variables de `.env.example` (base, Keycloak, Meilisearch, S3, SMTP) seront lues par les prochaines étapes de la M1. Toutes sont générées par `pnpm infra:setup` dans `apps/api/.env` (jamais commité).

Base de données (outils comme DBeaver) : `localhost:5433`, base `plumiotheca`, utilisateur `plumiotheca`, mot de passe `POSTGRES_PASSWORD` dans `infra/.env`.

## Image Docker

Construite depuis la racine : `docker build -f apps/api/Dockerfile .` (aucune image publiée pour l'instant).
