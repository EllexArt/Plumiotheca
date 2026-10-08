# API Plumiotheca

NestJS 12 (ESM), Node 24. Architecture cible : [docs/architecture.md](../../docs/architecture.md).

> En construction (jalon M1) : santé, erreurs, journaux, sécurité HTTP et authentification. Ne pas déployer.

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

## Authentification

- Toute route exige un jeton d'accès Keycloak (`Authorization: Bearer …`), sauf celles marquées `@Public()` (refus par défaut).
- Le jeton est vérifié localement : signature (clés publiques en cache), émetteur, audience `api`, client `web`, type « Bearer ». Réponses : `401` (`non-authentifie`, `jeton-invalide`, `jeton-expire` — le web renouvelle alors le jeton).
- `@RequireRoles('moderation')` : rôle requis (`403 interdit`) et, pour la modération et l'administration, code TOTP validé pendant cette connexion (`403 mfa-requise`).
- `@CurrentUser()` donne la personne connectée ; son identifiant Keycloak reste privé. `user.roles` ne contient que les rôles **effectifs** : sans second facteur, la modération et l'administration sont dans `user.rolesAwaitingMfa`.
- Clés de Keycloak injoignables ou illisibles : `503 indisponible` journalisée (avec `Retry-After`), jamais un 401 qui déconnecterait tout le monde.
- `GET /api/moi` : rôles et double authentification de la session en cours.

## Compte dans l'application

- Le compte de l'application est créé à la première requête connectée (sans e-mail : il reste dans Keycloak).
- **Refus par défaut** : toute route connectée exige un compte prêt (première visite faite, charte en vigueur acceptée, âge d'au moins 15 ans déclaré). Sinon `403` : `premiere-visite-requise`, `charte-a-accepter` ou `age-minimum`. Les routes du parcours d'arrivée le permettent avec `@AllowAccountSteps(...)` ; `@CurrentAccount()` donne le compte.
- `GET /api/moi/compte` : mon compte et l'étape à franchir (`first-visit`, `charter`, `age-locked`, `ready`).
- `POST /api/moi/compte/premiere-visite` : pseudonyme, âge déclaré (`under-15`, `15-17`, `18+`), version de la charte lue. « Moins de 15 ans » verrouille le compte : seule cette réponse est gardée.
- `POST /api/moi/compte/charte` : accepter une nouvelle version de la charte ([docs/charte.md](../../docs/charte.md), version dans `@plumiotheca/contracts`).
- `PUT /api/moi/compte/pseudonyme` : 3 à 30 caractères, unicité sans casse ni accents, noms officiels réservés, un changement par mois ; l'ancien pseudonyme est bloqué 90 jours.
- `PATCH /api/moi/compte/profil` : nom affiché, pronoms, présentation.
- `GET /api/pseudonymes/:handle` (public) : profil public, sans identifiant, âge ni e-mail ; `GET /api/pseudonymes/:handle/disponibilite`.

## Histoires et chapitres

- **Visibilité** (une seule règle, `src/stories/story-access.ts`) : le public ne voit que les histoires publiées dont le compte est actif et complet ; la personne qui écrit voit les siennes, brouillons compris, y compris sur les routes publiques si elle envoie son jeton. Invisible pour vous : 404 (l'existence ne fuite pas) ; visible mais pas à vous : 403 pour toute modification.
- `GET /api/histoires` (public) : histoires publiées, les plus récentes d'abord, pagination par curseur (`apres`, `limite`), filtres `langue`, `classement`, `exclure` (avertissements majeurs), `pseudonyme`. Jamais le texte des chapitres.
- `POST /api/histoires`, `PATCH /api/histoires/:id` (liste blanche des champs, jamais d'identifiant, d'autrice ou auteur, de statut ni de compteur), `DELETE`, `POST …/publication` (classement, avertissements et un chapitre publié exigés), `POST …/depublication`, `GET /api/moi/histoires?limite=&apres=` (mes histoires, brouillons compris, la plus récemment modifiée d'abord, page `{ items, nextCursor }`).
- Chapitres : `POST /api/histoires/:id/chapitres` (position choisie par le serveur), `PUT …/chapitres/ordre` (ordre complet, appliqué d'un coup), `PATCH`/`DELETE …/chapitres/:chapitre`, `GET`/`PUT …/brouillon` (document validé par `@plumiotheca/editor-schema`, identifiants de blocs complétés, 409 `brouillon-modifie` si la version est dépassée, 30 sauvegardes par minute au plus), `POST …/publication` (révision figée, dans une transaction), `GET …/chapitres/:chapitre` (public : version publiée).
- Un chapitre adressé via une autre histoire que la sienne répond 404 (faille C2).

## Configuration

Validée au démarrage par `src/config/env.ts` : l'API s'arrête avec la liste des variables en cause (sans leur valeur).

| Variable                 | Défaut                                     | Rôle                                                                |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------- |
| `NODE_ENV`               | `development`                              | `production` désactive la documentation OpenAPI                     |
| `HOST`                   | `127.0.0.1`                                | `0.0.0.0` dans l'image Docker                                       |
| `PORT`                   | `3000`                                     |                                                                     |
| `LOG_LEVEL`              | `info`                                     | niveau pino                                                         |
| `CORS_ORIGINS`           | origines locales de dev                    | liste séparée par des virgules, obligatoire en production           |
| `TRUST_PROXY`            | `0`                                        | proxys inverses devant l'API, obligatoire en production             |
| `RATE_LIMIT_PER_MINUTE`  | `120`                                      | requêtes par minute et par adresse IP                               |
| `KEYCLOAK_ISSUER`        | realm local (port 8080)                    | émetteur des jetons vu par le navigateur, obligatoire en production |
| `KEYCLOAK_JWKS_URL`      | `<émetteur>/protocol/openid-connect/certs` | autre chemin vers les clés (ex. réseau interne d'un conteneur)      |
| `JWT_AUDIENCE`           | `api`                                      | audience exigée                                                     |
| `JWT_CLIENTS`            | `web`                                      | clients autorisés (`azp`), séparés par des virgules                 |
| `DB_HOST`, `DB_PORT`     | `localhost`, `5433`                        | base PostgreSQL (infra de développement par défaut)                 |
| `DB_USERNAME`, `DB_NAME` | `plumiotheca`                              |                                                                     |
| `DB_PASSWORD`            | —                                          | obligatoire en production                                           |
| `DB_SSL`                 | `false`                                    | connexion chiffrée à la base                                        |
| `DB_CONNECT_RETRIES`     | `5`                                        | essais de connexion au démarrage (2 s d'écart)                      |
| `DB_MIGRATE_ON_START`    | `true` en développement                    | applique les migrations au démarrage                                |

Les autres variables de `.env.example` (Meilisearch, S3, SMTP) seront lues par les prochaines étapes de la M1. Toutes sont générées par `pnpm infra:setup` dans `apps/api/.env` (jamais commité).

Base de données (outils comme DBeaver) : `localhost:5433`, base `plumiotheca`, utilisateur `plumiotheca`, mot de passe `POSTGRES_PASSWORD` dans `infra/.env`.

## Base de données et migrations

TypeORM 1.x, PostgreSQL 18, tables et colonnes en `snake_case`, identifiants UUID v7. Jamais de synchronisation automatique : le schéma ne change que par migration.

```bash
pnpm --filter @plumiotheca/api migration:generate src/database/migrations/NomDeLaMigration
# puis l'ajouter à src/database/migrations/index.ts
pnpm --filter @plumiotheca/api migration:run      # appliquer (code compilé : pnpm build avant)
pnpm --filter @plumiotheca/api migration:revert   # annuler la dernière
pnpm --filter @plumiotheca/api migration:check    # échoue si une migration manque (CI)
```

- En développement, l'API applique les migrations au démarrage (`DB_MIGRATE_ON_START`, désactivé par défaut ailleurs).
- Base injoignable au démarrage : quelques essais (`DB_CONNECT_RETRIES`), puis arrêt avec un code d'erreur et un message sans mot de passe.
- Les tests utilisent une base dédiée (`plumiotheca_test`), recréée et migrée à chaque lancement : `pnpm infra:up` d'abord.
- Brouillon d'un chapitre : toujours `saveDraft()` (mise à jour conditionnelle sur `draft_version`, 409 si le brouillon a changé ailleurs), jamais `save()`.
- Erreurs de PostgreSQL journalisées sans message ni pile (ils peuvent citer la valeur reçue) : code SQLSTATE, contrainte et table seulement.
- Production : migrations lancées par une tâche unique avant le déploiement, pas au démarrage de chaque instance (TypeORM ne verrouille pas les migrations concurrentes, voir #67).

## Tâches en arrière-plan

File **pg-boss** dans la même base, schéma `pgboss` (créé et mis à jour par pg-boss, hors migrations TypeORM). Un module déclare ses tâches à l'initialisation :

```ts
onModuleInit() {
  this.jobs.define<{ storyId: string }>({
    name: 'indexer-histoire',
    handle: (data) => this.index(data.storyId),
    retryLimit: 3, // nouvelles tentatives, délai croissant (30 s, puis plus)
    cron: '0 3 * * *', // facultatif : tâche planifiée (Europe/Paris)
  });
}
```

puis `jobs.send('indexer-histoire', { storyId })`.

- Une tâche en échec est rejouée (délai croissant) ; les traitements doivent être **idempotents** (une tâche interrompue est rejouée). Une tâche à la fois par traitement.
- Journal des échecs : nom, identifiant, tentative, type, code et emplacement de l'erreur ; **jamais les données de la tâche, ni le message ou la pile de l'erreur** (ils peuvent citer une valeur). pg-boss ne garde de son côté qu'une erreur générique.
- Conservation : une tâche terminée (avec ses données) est supprimée après 7 jours.
- Modifier `retryLimit` ou `cron` dans le code s'applique au démarrage suivant, files existantes comprises ; retirer `cron` retire la planification.
- `JOBS_ENABLED` : active par défaut, désactivée dans les tests (un test l'active pour la vérifier). À l'arrêt, les tâches en cours ont 10 s pour finir, **avant** la fermeture de la base.
- Production : pg-boss crée et met à jour son schéma au démarrage (verrou, plusieurs instances possibles) ; le rôle PostgreSQL de l'API doit donc avoir le droit `CREATE` sur la base. Chaque instance ouvre 4 connexions pour la file, en plus du pool de TypeORM.

## Image Docker

Construite depuis la racine : `docker build -f apps/api/Dockerfile .` (aucune image publiée pour l'instant).
