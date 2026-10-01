# Architecture cible de Plumiotheca

> Statut : **validé** (octobre 2026). Ce document décrit où l'on va, pas l'état actuel du code.

## 1. Vision produit en une phrase

Une plateforme de lecture et d'écriture confortable des deux côtés : des outils sérieux pour les écrivains, une lecture agréable pour les lecteurs, et une communauté saine par construction.

Trois piliers guident les choix techniques :

| Pilier | Ce que ça implique techniquement |
|---|---|
| **Écrire** | Éditeur riche, sauvegarde automatique, historique des versions, outils d'univers (personnages, lieux, chronologie), statistiques. |
| **Lire** | Rendu typographique soigné, réglages de lecture, reprise de lecture, bibliothèque, mobile d'abord. |
| **Communauté** | Commentaires par paragraphe, abonnements, notifications, **modération dès le départ** (signalements, blocages, avertissements de contenu). |

### Identité et principes d'expérience (validés sur maquettes)

Maquettes de référence : canevas « Plumiotheca — pistes d'identité », page *Concept — bibliothèque vivante*.

- **Web d'abord** : Plumiotheca est un site web *responsive* (ordinateur, tablette, téléphone), conçu en priorité pour l'ordinateur. Pas d'application native à installer depuis un magasin ; une PWA (installable depuis le navigateur, lecture hors ligne) viendra plus tard.
- **Identité « Lampe de chevet »** : Young Serif (titres), Literata (lecture), Figtree (interface). Palette par défaut *Lueur* en clair et en sombre ; *Bougie*, *Indigo et lune* et *Encre et rouille* sont des ambiances au choix (#77).
- **Métaphore de bibliothèque dans le visuel, mots simples dans l'interface** : livres en cours montrés de dos, sélections présentées comme des étagères, mais les libellés restent « Mes lectures », « Explorer », « Univers », « Écrire ».
- **La lecture d'abord** : aucune annotation dans le texte. Un repère discret en marge (bulle + nombre) indique les passages commentés ; les échanges s'ouvrent dans un panneau ou sont regroupés en fin de chapitre. Les repères peuvent être masqués.
- **Découverte humaine** : sélections publiques composées par des membres et par l'équipe, recommandations écrites. Pas de fil algorithmique en page d'accueil.
- **Compteurs publics conservés, dans notre vocabulaire** : lecteurs (uniques), « en cours de lecture », recommandations.
- **Avertissements toujours visibles**, exclusions possibles par recherche ou de façon permanente (« Mes limites ») ; ce qui est masqué est toujours signalé.
- **Sans divulgâchage** : fiches personnages et chronologie d'un univers ne montrent que ce que la personne a déjà lu.
- **Accessible à toutes et tous, par défaut** : objectif **RGAA 4 / WCAG 2.2 niveau AA** sur tout le site (voir §1 bis).

## 1 bis. Accessibilité

L'accessibilité fait partie de la définition de « terminé » de chaque issue, au même titre que les tests.

- **Lecteurs d'écran** (NVDA, JAWS, VoiceOver, TalkBack) : HTML sémantique d'abord (titres hiérarchisés, `nav`, `main`, `article`, listes, vrais `button` et `a`), ARIA seulement en complément. Composants Radix pour les menus, dialogues et onglets (focus et annonces gérés).
- **Lecture** : chaque chapitre est un `article` avec titre ; les repères de notes sont des boutons annoncés (« 7 notes sur ce passage ») et ne coupent jamais la lecture vocale du texte ; le panneau de notes est un dialogue qui piège et restitue le focus ; la progression est annoncée.
- **Clavier** : tout est utilisable sans souris, ordre de tabulation logique, focus toujours visible, raccourcis de lecture (chapitre suivant, réglages) documentés et désactivables.
- **Vision** : contrastes AA vérifiés automatiquement pour les 8 thèmes ; zoom à 200 % et texte agrandi sans perte ; aucune information portée par la seule couleur (ex. tag exclu = barré et préfixé « − ») ; polices adaptées (Atkinson Hyperlegible, Lexend) et interligne réglable.
- **Mouvement et cognition** : respect de `prefers-reduced-motion`, pas de délai imposé, libellés en clair (vocabulaire simple validé), messages d'erreur explicites.
- **Cibles tactiles** de 44 × 44 px minimum.
- **Contenus des auteurs** : texte alternatif demandé pour les couvertures et images ; l'éditeur produit une structure propre (vrais titres, citations, séparateurs de scène annoncés).
- **Outillage** : `eslint-plugin-jsx-a11y`, tests `axe-core` dans les tests de composants et Playwright, audit manuel au lecteur d'écran avant chaque jalon, page « Déclaration d'accessibilité » publiée.

## 2. Vue d'ensemble

```
                    ┌───────────────────────────┐
  Navigateur ──────▶│  apps/web  (React SPA)    │
                    └─────────────┬─────────────┘
                                  │ HTTPS + JWT (OIDC)
                    ┌─────────────▼─────────────┐        ┌──────────────┐
                    │  apps/api  (NestJS)       │◀──────▶│  Keycloak    │ identité, inscription,
                    └──┬──────────────┬─────────┘  JWKS  └──────┬───────┘ mots de passe, MFA
                       │              │                         │
                ┌──────▼─────┐  ┌─────▼─────────┐               │
                │ PostgreSQL │  │ Stockage S3   │               │
                │ (app + KC) │◀─┼───────────────┼───────────────┘
                └────────────┘  │ (MinIO en dev)│ couvertures, avatars
                                └───────────────┘
```

## 3. Organisation du dépôt (monorepo pnpm)

```
Plumiotheca/
├── apps/
│   ├── api/                 NestJS : API REST + OpenAPI
│   └── web/                 React + Vite : application unique
├── packages/
│   ├── contracts/           Schémas zod partagés (entrées/sorties de l'API) + types TS
│   └── editor-schema/       Schéma TipTap partagé (rendu côté web, validation côté API)
├── infra/
│   ├── docker-compose.yml   Postgres, Keycloak, Meilisearch, MinIO, Mailpit pour le dev
│   └── keycloak/            Realm versionné (export valide)
├── docs/                    Architecture, décisions (ADR), maquettes
└── .github/workflows/       CI
```

- **pnpm workspaces** : un seul `pnpm install`, dépendances partagées, scripts orchestrés depuis la racine.
- **`packages/contracts`** est la pièce maîtresse : le même schéma zod valide la requête dans l'API **et** type le client dans le web. Fini les champs non filtrés (`id`, `viewsCount`, `author`…) et les types dupliqués.

## 4. Backend — `apps/api`

**NestJS + TypeORM + PostgreSQL**, Node 24 LTS.

### Modules

| Module | Responsabilité |
|---|---|
| `auth` | Vérification des JWT Keycloak (JWKS via `jose`), guard global, décorateur `@Public()`, rattachement de l'utilisateur local. |
| `users` | Profil public (pseudonyme unique, bio, avatar), préférences privées. **L'email n'est jamais exposé.** |
| `stories` | Histoires, statut (brouillon / publiée / archivée), tags, avertissements de contenu, public visé. |
| `chapters` | Chapitres, ordre, version publiée vs brouillon, révisions. |
| `universes` | Univers partagés entre histoires : fiches personnages, lieux, chronologie, notes. Gère les membres et le mode d'ouverture (voir §5 bis). |
| `reading` | Bibliothèque, listes de lecture, progression (chapitre + position), réglages de lecture synchronisés. |
| `social` | Abonnements (auteurs, histoires), likes, commentaires (chapitre et paragraphe). |
| `notifications` | Nouveau chapitre, réponse à un commentaire, nouvel abonné. |
| `moderation` | Signalements, blocages, masquage, journal d'actions des modérateurs. |
| `media` | Upload d'images vers S3 via URL pré-signée. |
| `stats` | Lectures uniques, temps de lecture, statistiques auteur. |
| `tags` | Tags libres, tags canoniques, synonymes et hiérarchie ; outils des « jardiniers des tags ». |
| `search` | Indexation et recherche à facettes (Meilisearch), recherches enregistrées et alertes. |

### Règles transverses

- **Validation** : chaque entrée passe par un DTO issu de `packages/contracts` (via `nestjs-zod`). Liste blanche stricte.
- **Sérialisation** : chaque sortie a un schéma « public ». Aucune entité TypeORM n'est renvoyée telle quelle.
- **Autorisation** : vérification de la propriété dans un guard / une policy, pas dans chaque route.
- **Erreurs** : filtre global → format d'erreur unique, jamais de détails internes au client.
- **Pagination** par curseur sur toutes les listes.
- **Migrations TypeORM** versionnées ; `synchronize` désactivé partout.
- **Comptage des vues** : une lecture unique par utilisateur (ou empreinte anonyme) et par fenêtre de temps.
- **OpenAPI** générée depuis les contrats et publiée à chaque build.

### Authentification

- Keycloak reste le fournisseur d'identité (inscription, connexion, mot de passe oublié, MFA, connexion sociale plus tard).
- Le front utilise **Authorization Code + PKCE** (`oidc-client-ts` / `react-oidc-context`).
- L'API **ne parle plus à Keycloak à chaque requête** : elle valide la signature du JWT via le JWKS mis en cache. `keycloak-connect` (déprécié) et `express-session` disparaissent.
- `KC_HOSTNAME` est fixé pour que l'émetteur (`iss`) soit identique depuis le navigateur et depuis l'API.
- Keycloak stocke ses données dans Postgres (base dédiée), version épinglée.

## 5. Modèle de contenu (le choix structurant)

Le texte des chapitres est stocké en **JSON ProseMirror/TipTap**, pas en texte brut ni en HTML.

- Chaque bloc (paragraphe, titre, citation…) porte un **identifiant stable** (`attrs.id`). C'est ce qui permet les commentaires par paragraphe, les annotations, la reprise de lecture précise et des différences propres entre versions.
- `chapter_revisions` conserve des instantanés : sauvegarde automatique (compactée), versions nommées par l'auteur, version publiée.
- Le chapitre publié est une révision figée : l'auteur retravaille un brouillon sans casser la lecture en cours.
- Le schéma TipTap vit dans `packages/editor-schema` : l'API rejette tout document non conforme (pas de HTML arbitraire, pas de XSS).
- Compteur de mots et temps de lecture calculés à l'enregistrement.

## 5 bis. Univers : solo, collaboratif, ouvert

Un univers (et les histoires qui s'y rattachent) a un **propriétaire** et un **mode d'ouverture** que le propriétaire choisit et peut faire évoluer :

| Mode | Qui écrit dans l'univers | Exemple |
|---|---|---|
| **Solo** | Le propriétaire uniquement | Une saga personnelle |
| **Collaboratif** | Les co-auteurs invités, avec un rôle | Un projet à quatre mains |
| **Ouvert sur invitation** | Des personnes choisies, avec des droits restreints (ex. proposer des fiches, écrire des histoires annexes) | Un cercle d'écriture |
| **Fanfictions autorisées** | N'importe qui peut écrire une histoire *dérivée*, rattachée à l'univers mais qui ne modifie pas le canon | Un univers qui fédère une communauté |

Conséquences sur le modèle :

- `universe_members(universe, user, role)` avec des rôles : `owner`, `coauthor` (édite tout), `contributor` (propose, l'auteur valide), `reader_beta` (lit les brouillons, commente).
- Les fiches (personnages, lieux, événements) ont un **statut canon / proposition** : les contributions passent par une validation de l'auteur.
- Une histoire a un `canon_status` : `canon` (écrite par l'auteur ou un co-auteur) ou `fanfiction` (dérivée, affichée séparément, avec l'auteur d'origine crédité).
- L'auteur peut **révoquer** l'ouverture aux fanfictions : les fanfictions existantes restent en ligne mais ne sont plus rattachées visiblement à l'univers (choix à affiner).
- Toutes les permissions passent par une seule *policy* `UniversePolicy`, testée en profondeur.

## 5 ter. Recherche, tags et avertissements

Pensée pour les lectrices et lecteurs de fanfiction (référence : AO3).

**Métadonnées structurées d'une histoire**
- Univers (ou « histoire originale »), **personnages** et **relations** sont des entités, pas du texte libre. Les personnages sont ceux des fiches de l'univers.
- Relation = ensemble de personnages + type : **romantique `/`** ou **platonique / familiale `&`**.
- Classement : Tout public, Ado, Mature, Explicite.
- Statut (en cours / terminée), langue, nombre de mots, nombre de chapitres (publiés / prévus).

**Avertissements : modèle mixte**
- Avertissements **majeurs obligatoires** à renseigner : mort de personnage, violence explicite, non-consentement, contenu sexuel impliquant des mineurs (interdit, donc refusé), ou « je préfère ne pas préciser ».
- Liste **fine et facultative** : deuil, automutilation, troubles alimentaires, etc.
- Les lecteurs excluent par recherche ou de façon permanente (« Mes limites »). « Non précisé » est excluable comme un avertissement.

**Tags et synonymes**
- Tags libres saisis par les auteurs. Normalisation automatique (casse, accents, tirets, espaces) vers un tag existant.
- Les **tags canoniques** regroupent les synonymes (« slowburn », « Slow Burn » → *slow burn*), y compris d'une langue à l'autre. Un sous-tag hérite de son parent.
- Les **jardiniers des tags** (rôle bénévole) fusionnent, renomment et rattachent, avec un journal des opérations. La recherche porte toujours sur le tag canonique.

**Moteur**
- **Meilisearch** auto-hébergé : facettes avec comptes, inclusion et exclusion, tolérance aux fautes, accents. PostgreSQL reste la source de vérité ; un indexeur synchronise à chaque changement.
- Saisie intelligente : la barre reconnaît personnages, relations (`Ilse/Tomas`, `Ilse & Tomas`), tags et exclusions (`-angst`) et les transforme en filtres.
- Recherches enregistrées et alertes « nouvelle histoire correspondant à ma recherche ».

## 6. Frontend — `apps/web`

**React 19 + Vite + TypeScript**, une seule application, découpée par fonctionnalités et chargée à la demande.

| Brique | Choix |
|---|---|
| Routage | React Router (mode framework / data) avec chargement paresseux par route |
| Données serveur | TanStack Query + client généré depuis `packages/contracts` |
| Éditeur | TipTap (extensions : identifiants de blocs, compteur, focus, commentaires) |
| Styles | CSS Modules + variables CSS (design tokens) ; thèmes clair / sombre / sépia |
| Composants accessibles | Radix UI (primitives sans style) |
| Formulaires | React Hook Form + zod (mêmes schémas que l'API) |
| Auth | `react-oidc-context` |
| PWA | Service worker pour la lecture hors ligne (plus tard) |

```
apps/web/src/
├── app/            routes, layout, fournisseurs (auth, query, thème)
├── features/
│   ├── reader/     lecteur, réglages de lecture, progression
│   ├── editor/     éditeur TipTap, révisions, objectifs
│   ├── stories/    fiches histoire, découverte, recherche
│   ├── universes/  wiki d'univers
│   ├── library/    bibliothèque et listes
│   ├── social/     commentaires, abonnements, notifications
│   └── account/    profil, préférences
├── shared/         composants UI, hooks, utilitaires
└── styles/         tokens, thèmes, typographie
```

## 7. Qualité et outillage

- **TypeScript strict** partout, ESLint + Prettier communs.
- **Tests** : Vitest (web, packages), Jest (unitaire Nest), tests e2e API avec Postgres via Testcontainers, Playwright pour les parcours clés.
- **Commits conventionnels** (déjà en usage) ; changelog généré.
- **Renovate** ou Dependabot pour les mises à jour.

## 8. CI/CD

GitHub Actions, sans déploiement pour l'instant :

1. `ci.yml` sur chaque PR et sur `main` : installation pnpm (avec cache) → lint → vérification des types → tests unitaires → tests e2e API (service Postgres) → build web et API.
2. `docker.yml` sur `main` et les tags : construction des images `api` et `web`, publication sur **GitHub Container Registry** (gratuit pour un dépôt public).
3. Plus tard : un workflow de déploiement branché sur la cible choisie (VPS + Docker Compose, Fly.io, Render, Scaleway…).

Protection de `main` : PR obligatoire, CI verte.

## 9. Migration depuis l'existant

Le code actuel est petit : on **reconstruit au bon endroit** plutôt que de tout migrer d'un coup.

1. Socle : pnpm, `infra/`, realm Keycloak corrigé, CI minimale.
2. `apps/api` : nouveau projet NestJS qui reprend entités et routes existantes, sécurisées.
3. `apps/web` : application unique qui reprend lecteur et éditeur, connexion OIDC.
4. Suppression du code Express et des micro-frontends une fois la parité atteinte.

## 10. Décisions prises

| # | Décision | Statut |
|---|---|---|
| 1 | Monorepo unique `EllexArt/Plumiotheca` (historiques conservés) | ✅ fait |
| 2 | Une seule application web (abandon des micro-frontends) | ✅ validé |
| 3 | Backend NestJS + TypeORM + PostgreSQL | ✅ validé |
| 4 | Éditeur TipTap, contenu stocké en JSON ProseMirror | ✅ validé |
| 5 | pnpm workspaces + `packages/contracts` (zod partagé) | ✅ validé |
| 6 | Keycloak conservé, validation JWT par JWKS, PKCE côté web | ✅ validé |
| 7 | Stockage S3 (MinIO en dev) pour les images | proposé |
| 8 | CSS Modules + tokens + Radix (pas de Tailwind) | ✅ validé |
| 9 | Univers : solo, collaboratif, ouvert sur invitation, fanfictions — au choix du propriétaire | ✅ validé |
| 10 | Identité « Lampe de chevet », palette Lueur + 3 ambiances au choix | ✅ validé |
| 11 | Concept « bibliothèque vivante » avec vocabulaire simple ; notes de lecture en marge discrètes | ✅ validé |
| 12 | Compteurs publics : lecteurs, en cours de lecture, recommandations | ✅ validé |
| 13 | Recherche à facettes avec Meilisearch, personnages et relations structurés | proposé |
| 14 | Avertissements : modèle mixte (majeurs obligatoires + liste fine facultative) | ✅ validé |
| 15 | Tags : normalisation automatique + jardiniers des tags bénévoles | ✅ validé |
| 16 | Accessibilité RGAA 4 / WCAG 2.2 AA, incluse dans la définition de « terminé » | ✅ validé |
| 17 | Web d’abord : site responsive, ordinateur prioritaire, pas d’application native (PWA plus tard) | ✅ validé |
