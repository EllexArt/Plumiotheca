# Contribuer à Plumiotheca

## Flux Git

Le dépôt suit un **git flow** : `main` ne contient que des versions publiées, `develop` intègre le travail en cours.

```
feat/…  fix/…  docs/…  chore/…        hotfix/X.Y.Z
   │ squash        │                    │    ▲
   ▼               ▼                    ▼    │ (part de main)
────────────── develop ──────► release/X.Y.Z ──► main ── tag vX.Y.Z
   ▲                                              │
   └──────────── report (commit de fusion) ───────┘
```

| Branche                                                           | Part de   | Arrive dans                        | Fusion           |
| ----------------------------------------------------------------- | --------- | ---------------------------------- | ---------------- |
| `feat/<sujet>`                                                    | `develop` | `develop`                          | squash           |
| `fix/<sujet>`                                                     | `develop` | `develop`                          | squash           |
| `docs/`, `chore/`, `refactor/`, `test/`, `ci/`, `perf/`, `build/` | `develop` | `develop`                          | squash           |
| `release/X.Y.Z`                                                   | `develop` | `main`, puis report dans `develop` | commit de fusion |
| `hotfix/X.Y.Z`                                                    | `main`    | `main`, puis report dans `develop` | commit de fusion |

- **Une issue, une branche, une PR** vers `develop`, avec `Closes #<issue>` dans la description. Noms en minuscules : `feat/api-histoires`, `fix/curseur-annee-0000`.
- **Squash** pour le travail courant : un commit propre par PR, au format des commits conventionnels (`feat(api): …`, `fix(web): …`).
- **Version** : créer `release/X.Y.Z` depuis `develop` (seuls les correctifs de la version y arrivent ensuite), ouvrir la PR vers `main` et la fusionner par **commit de fusion**, poser le tag `vX.Y.Z` sur `main` (il déclenchera la publication des images, #6), puis ouvrir la PR de report `main` → `develop`, elle aussi par commit de fusion.
- **Correction urgente** d'une version publiée : `hotfix/X.Y.Z` depuis `main`, même chemin qu'une version.
- Avant la mise en production (jalon M6, décision 31), `main` ne reçoit que les versions de fin de jalon.

`main` et `develop` sont protégées : PR obligatoire (administratrices et administrateurs compris), vérifications de la CI au vert et à jour avec la branche cible, discussions résolues, ni poussée forcée ni suppression. La vérification **Flux Git** refuse une PR vers `main` qui ne vient pas de `release/` ou `hotfix/`, et un nom de branche hors convention.

## Avant de fusionner

1. CI au vert (API, web, qualité, dépendances, flux Git).
2. Revue tech lead (`/revue-tech-lead <numéro>`), rapport dans `docs/revues/`, constats bloquants corrigés.
3. Définition de « terminé » du modèle de PR, accessibilité comprise (RGAA 4, WCAG 2.2 AA).

## Développer

Voir le [README](README.md) (installation, infrastructure, commandes) et [docs/architecture.md](docs/architecture.md) (décisions).
