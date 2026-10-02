# Plumiotheca

Une plateforme pour lire, écrire et partager des histoires et des univers : des outils sérieux pour les écrivains, une lecture confortable, une communauté saine par construction.

> ⚠️ **Projet en reconstruction — ne pas déployer.** Le code actuel de `apps/` est un prototype qui contient des failles de sécurité connues et documentées ([revue du 2 octobre 2026](docs/revues/2026-10-02-pr-76-98-et-main.md)). Il est en cours de réécriture (jalons M0 et M1).

- Architecture cible et décisions : [docs/architecture.md](docs/architecture.md)
- Feuille de route : [tableau du projet](https://github.com/users/EllexArt/projects/2) · [résumé](docs/backlog.md)

## Développer

Prérequis : Node 24 (`.nvmrc`), [Corepack](https://nodejs.org/api/corepack.html) activé (`corepack enable`), Docker pour l'infrastructure.

```bash
pnpm install        # installe tout le monorepo
pnpm typecheck      # vérifie les types de toutes les applications
pnpm test           # lance les tests
pnpm build          # construit toutes les applications
pnpm dev:api        # API (nécessite Postgres et Keycloak : voir apps/api/README.md)
pnpm dev:web        # application web
```

| Dossier | Contenu |
|---|---|
| `apps/api` | API (prototype Express, en cours de réécriture en NestJS) |
| `apps/web` | Application web (prototype en micro-frontends, en cours de réécriture) |
| `docs/` | Architecture, décisions, revues |

Les scripts d'installation des dépendances sont bloqués par défaut ; seuls ceux listés dans `pnpm-workspace.yaml` (`allowBuilds`) sont autorisés.

Licence : MIT.
