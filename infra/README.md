# Infrastructure de développement

| Service          | Rôle                                           | Adresse locale                             |
| ---------------- | ---------------------------------------------- | ------------------------------------------ |
| PostgreSQL 18    | base de l'application + base dédiée à Keycloak | `localhost:5433`                           |
| Keycloak 26.8    | comptes, connexion, MFA                        | http://localhost:8080 (console : `/admin`) |
| Meilisearch 1.54 | recherche                                      | http://localhost:7700                      |
| Garage 2.4       | stockage des images (compatible S3)            | http://localhost:3900                      |
| Mailpit 1.31     | capture les e-mails envoyés                    | http://localhost:8025                      |

Tous les ports sont liés à `127.0.0.1` : rien n'est exposé sur le réseau local.

## Démarrer

```bash
pnpm infra:setup   # une fois : crée infra/.env et apps/api/.env avec des secrets aléatoires
pnpm infra:up      # démarre tout, attend que chaque service soit prêt, initialise Garage
node infra/scripts/check-realm.mjs   # vérifie Keycloak de bout en bout
```

Autres commandes : `pnpm infra:logs`, `pnpm infra:down` (arrête), `pnpm infra:reset` (arrête **et efface les données**).

Les identifiants de la console Keycloak sont dans `infra/.env` (jamais commité).

## Keycloak

Le realm `infra/keycloak/realm-plumiotheca.json` est **généré, jamais écrit à la main** : `infra/scripts/keycloak-realm.mjs` le configure via l'API d'administration (c'est la version lisible) puis l'exporte.

Choix de configuration :

- inscription ouverte, **e-mail vérifié**, connexion par e-mail ou nom d'utilisateur ;
- le nom d'utilisateur n'est jamais l'e-mail ; **ni prénom ni nom** dans le profil (pseudonymat, minimisation) ;
- protection contre les essais de mots de passe répétés ; mots de passe de 10 caractères minimum ;
- client `web` : public, code d'autorisation + **PKCE obligatoire**, pas de mot de passe direct ;
- client `api` : cible d'audience des jetons, sans flux de connexion ;
- rôles `moderation`, `administration` (**double authentification obligatoire**) et `jardinage-tags` ;
- français par défaut ; e-mails envoyés vers Mailpit.

Pour modifier le realm : changer `keycloak-realm.mjs`, puis
`pnpm infra:reset`, retirer temporairement le JSON de `infra/keycloak/`, `pnpm infra:up`,
`node infra/scripts/keycloak-realm.mjs` (réécrit le JSON), et `check-realm.mjs`.

## Garage

Nœud unique, bucket `medias`. `infra/scripts/garage-init.mjs` (lancé par `pnpm infra:up`) crée la disposition, le bucket et la clé d'accès de l'API, et écrit les identifiants dans `apps/api/.env`.
MinIO a été écarté : son édition communautaire n'est plus maintenue depuis 2026.
