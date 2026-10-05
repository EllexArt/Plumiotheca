# Architecture cible de Plumiotheca

> Statut : **validé** (octobre 2026). Ce document décrit où l'on va, pas l'état actuel du code.

## 1. Vision produit en une phrase

Une plateforme de lecture et d'écriture confortable des deux côtés : des outils sérieux pour les écrivains, une lecture agréable pour les lecteurs, et une communauté saine par construction.

Trois piliers guident les choix techniques :

| Pilier         | Ce que ça implique techniquement                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Écrire**     | Éditeur riche, sauvegarde automatique, historique des versions, outils d'univers (personnages, lieux, chronologie), statistiques.                 |
| **Lire**       | Rendu typographique soigné, réglages de lecture, reprise de lecture, bibliothèque, site responsive pensé d'abord pour l'ordinateur.               |
| **Communauté** | Notes de lecture, recommandations, abonnements, galerie, cercles d'entraide, **modération dès le départ** — et aucune messagerie privée (§1 ter). |

### Identité et principes d'expérience (validés sur maquettes)

Maquettes de référence : canevas « Plumiotheca — pistes d'identité », pages _Web — ordinateur_, _Web — écrire_, _Web — communauté_ et _Web — mobile_.

- **Web d'abord** : Plumiotheca est un site web _responsive_ (ordinateur, tablette, téléphone), conçu en priorité pour l'ordinateur. Pas d'application native à installer depuis un magasin ; une PWA (installable depuis le navigateur, lecture hors ligne) viendra plus tard.
- **Identité « Lampe de chevet »** : Young Serif (titres), Literata (lecture), Figtree (interface). Palette par défaut _Lueur_ en clair et en sombre ; _Bougie_, _Indigo et lune_ et _Encre et rouille_ sont des ambiances au choix (#77).
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

## 1 ter. Communauté, sécurité et contenus

Choix fondateurs, validés en octobre 2026 :

- **Écrire anonymement est une valeur.** Inscription avec un e-mail et un pseudonyme ; aucune donnée d'identité civile, aucune vérification par pièce d'identité. Âge **déclaré**, **15 ans minimum**. On ne stocke qu'une **tranche déclarée** (« 15-17 » ou « 18+ »), jamais la date de naissance. Les 15-17 ans voient le contenu Mature avec ses avertissements (comme le young adult « pour lecteurs avertis » en édition) et peuvent l'exclure ; la tranche fermera l'accès à un futur classement Explicite.
- **Aucune messagerie privée.** Tous les échanges ont lieu dans des espaces publics ou modérés : notes de lecture, notes de fin de chapitre, recommandations, retours de bêta-lecture. Cela supprime le principal canal de harcèlement et d'emprise, sans avoir à vérifier l'âge de qui que ce soit.
- **Cercles d'entraide sans discussions** : petits groupes (taille limitée) pour la **bêta-lecture équitable** et les **défis**. La bêta-lecture se fait **uniquement dans un cercle** : les retours sont visibles de tous ses membres et signalables à l'équipe, ce qui exclut tout échange privé de fait. Animatrices et animateurs, règles propres au cercle, création réservée aux comptes de plus de 14 jours.
- **Abonnements** à des personnes et à des univers ; nouveautés dans « Mes lectures ». Pas de fil algorithmique.
- **Profil** : pronoms, présentation, goûts de lecture ; visibilité réglable par section (public, abonnés, privé) et aperçu « comme un visiteur ».
- **Galerie** : illustrations des autrices et auteurs, fan arts (visibles dans la galerie de l'univers après validation de l'autrice ou de l'auteur), galeries d'artistes. **Description d'image obligatoire** (accessibilité). **Images générées par IA autorisées mais déclarées**, étiquetées et filtrables ; jamais présentées comme fan art.
- **Classements : Tout public, Ado, Mature.** Au lancement, **Mature est le maximum**. Le classement **Explicite** est reporté : il ne sera ouvert qu'avec une preuve de majorité qui ne transmet que « 18 ans ou plus » (ni identité, ni date de naissance, ni carte bancaire) et après avis juridique. Le design est prêt (masqué par défaut, écran d'avertissement, scènes repliables avec résumé).
- **Interdits absolus** : contenu sexuel impliquant des personnages mineurs (même fictifs), images explicites, publication d'informations personnelles d'autrui.

### Modération à trois niveaux

1. **Prévention par conception** : pas de messages privés, pas de discussion libre, petits cercles, premiers messages et liens des nouveaux comptes relus, limites de fréquence, masquage automatique provisoire des données personnelles.
2. **Animatrices de cercle** : signalements du cercle avec contexte, masquer un retour, rappel de règle, sourdine, exclusion, transmission à l'équipe, mise en pause du cercle.
3. **Équipe Plumiotheca** : file triée par urgence (protection des mineurs et données personnelles d'abord, avec un rôle d'accès restreint), contexte et historique, décision avec **motif obligatoire tiré de la charte** communiqué à la personne, **appel** examiné par une autre personne, journal d'audit et rapport de transparence — conforme à l'esprit du **DSA**.

## 1 quater. Données personnelles (protection dès la conception)

À intégrer au modèle de données dès le jalon M1 (#13), pas en fin de projet.

| Donnée                                               | Pourquoi                                                  | Durée de conservation                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| E-mail                                               | connexion, récupération du compte, notifications choisies | durée du compte, **dans Keycloak seulement**                                                  |
| Pseudonyme, profil, pronoms                          | affichage public choisi par la personne                   | durée du compte                                                                               |
| Tranche d'âge déclarée                               | protection des mineurs                                    | durée du compte                                                                               |
| Contenus (histoires, notes, images, fiches)          | service                                                   | durée du compte, puis selon le choix de suppression                                           |
| Journaux techniques                                  | sécurité, débogage                                        | 30 jours, **sans e-mail ni contenu** (masquage automatique)                                   |
| Décisions de modération                              | DSA, appels                                               | 3 ans, rattachées à un identifiant interne                                                    |
| Ancien pseudonyme (sans lien vers le compte)         | empêcher l'usurpation                                     | 90 jours après l'abandon                                                                      |
| Historique des pseudonymes (lié au compte)           | rattacher un signalement à un compte (modération seule)   | 1 an                                                                                          |
| Réponse « moins de 15 ans »                          | empêcher de recommencer aussitôt en changeant d'âge       | 30 jours, puis suppression du compte                                                          |
| Comptage des lectures anonymes                       | statistiques                                              | hachage effacé chaque jour                                                                    |
| Dernier chapitre ouvert par histoire (« Reprendre ») | reprise de lecture                                        | sur l'appareil seulement, comptes connectés, 50 histoires au plus, effacé à la fin de session |

- **Dans la base de l'application** : ni e-mail ni mot de passe (ils restent dans Keycloak) ; l'identifiant Keycloak n'est jamais exposé. Le compte porte son statut et le mode de suppression choisi : « effacer » supprime la ligne et ses contenus en cascade ; « anonymiser » garde une ligne « compte supprimé » dont toutes les colonnes personnelles sont vidées, pour que les contributions conservées y restent liées. Les révisions faites par une personne co-autrice dont le compte est effacé restent, sans auteur. La base refuse un compte « supprimé » qui garderait une donnée personnelle ; la liste des colonnes personnelles est tenue dans le code et vérifiée par les tests.
- **E-mails sortants** (notifications, suppression de compte) : l'API lit l'adresse dans Keycloak au moment de l'envoi, avec un compte de service limité à la lecture des comptes (puis à leur suppression pour #70), secret hors dépôt ; si Keycloak est indisponible, l'envoi est réessayé par la file de tâches.
- **Suppression de compte** : au moment de supprimer, la personne **choisit** entre tout effacer ou anonymiser ses contributions (notes, fiches d'univers collaboratifs, fan arts offerts) sous la mention « compte supprimé ». Ses histoires et images sont supprimées dans les deux cas. **Œuvres partagées** (histoire co-écrite, fan art offert à une autrice ou un auteur, fiches d'un univers collaboratif) : les co-autrices et co-auteurs, ou la personne destinataire, sont prévenus et **décident** de garder l'œuvre (part de la personne signée « compte supprimé ») ou de la retirer ; sans réponse sous 30 jours, l'œuvre est conservée anonymisée. Déroulé : la personne choisit (effacer ou anonymiser) et récupère l'export de ses histoires et de ses données, puis **ses accès sont coupés immédiatement** (plus de connexion, plus d'écriture) ; l'exécution suit sous 30 jours maximum (décision 47).
- **Pseudonymes** : un ancien pseudonyme n'est réattribuable qu'après 90 jours (anti-usurpation).
- **Images** : métadonnées (dont la géolocalisation) **toujours supprimées** par ré-encodage côté serveur, pour ne jamais révéler qui se cache derrière un pseudonyme.
- **Sous-traitants** : hébergement, sauvegardes, e-mail et suivi d'erreurs dans l'Union européenne ; liste tenue à jour dans la politique de confidentialité.
- Aucun outil de mesure d'audience tiers, aucun traceur publicitaire.

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
                └────────────┘  │ (Garage en dev)│ couvertures, avatars
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
│   ├── docker-compose.yml   Postgres, Keycloak, Meilisearch, Garage, Mailpit pour le dev
│   └── keycloak/            Realm versionné (export valide)
├── docs/                    Architecture, décisions (ADR), maquettes
└── .github/workflows/       CI
```

- **pnpm workspaces** : un seul `pnpm install`, dépendances partagées, scripts orchestrés depuis la racine.
- **`packages/contracts`** est la pièce maîtresse : le même schéma zod valide la requête dans l'API **et** type le client dans le web. Fini les champs non filtrés (`id`, `viewsCount`, `author`…) et les types dupliqués.

## 4. Backend — `apps/api`

**NestJS + TypeORM + PostgreSQL**, Node 24 LTS.

### Modules

| Module          | Responsabilité                                                                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`          | Vérification des JWT Keycloak (JWKS via `jose`), guard global, `@Public()`, `@RequireRoles()` avec preuve de MFA (`amr`), rattachement de l'utilisateur local.                                 |
| `users`         | Profil public (pseudonyme unique, bio, avatar), préférences privées. **L'email n'est jamais exposé.**                                                                                          |
| `stories`       | Histoires, statut (brouillon / publiée / archivée), tags, avertissements de contenu, public visé.                                                                                              |
| `chapters`      | Chapitres, ordre, version publiée vs brouillon, révisions.                                                                                                                                     |
| `universes`     | Univers partagés entre histoires : fiches personnages, lieux, chronologie, notes. Gère les membres et le mode d'ouverture (voir §5 bis).                                                       |
| `reading`       | Bibliothèque, listes de lecture, progression (chapitre + position), réglages de lecture synchronisés.                                                                                          |
| `social`        | Abonnements (personnes, univers), « J'ai aimé » (compteur privé, visible de l'autrice ou de l'auteur), recommandations, notes par passage et de fin de chapitre. **Pas de messagerie privée.** |
| `notifications` | Nouveau chapitre, réponse à un commentaire, nouvel abonné.                                                                                                                                     |
| `moderation`    | Signalements, blocages, file par urgence, décisions motivées, appels, journal, rapport de transparence.                                                                                        |
| `circles`       | Cercles d'entraide : annuaire, adhésion, rôles d'animation, bêta-lecture équitable, défis, outils d'animation.                                                                                 |
| `gallery`       | Images : origine déclarée (dont IA), description obligatoire, liens univers / histoires / personnages, validation des fan arts, droits.                                                        |
| `media`         | Upload d'images vers S3 via URL pré-signée.                                                                                                                                                    |
| `stats`         | Lectures uniques, temps de lecture, statistiques auteur.                                                                                                                                       |
| `tags`          | Tags libres, tags canoniques, synonymes et hiérarchie ; outils des « jardiniers des tags ».                                                                                                    |
| `search`        | Indexation et recherche à facettes (Meilisearch), recherches enregistrées et alertes.                                                                                                          |

### Règles transverses

- **Validation** : chaque entrée est déclarée avec un schéma de `packages/contracts` (`@Body({ schema })`, validation native « Standard Schema » de NestJS 12, sans classe DTO). Liste blanche stricte : `z.strictObject`, un champ inconnu est refusé (400). Les erreurs indiquent le champ en cause, jamais la valeur reçue.
- **Sérialisation** : chaque sortie a un schéma « public ». Aucune entité TypeORM n'est renvoyée telle quelle.
- **Autorisation** : vérification de la propriété dans un guard / une policy, pas dans chaque route.
- **Erreurs** : filtre global → format unique `application/problem+json` (RFC 9457, schéma `Problem` des contrats), jamais de détails internes au client ; l'identifiant de requête permet de retrouver l'erreur dans les journaux.
- **Journaux** : pino en JSON ; requêtes journalisées en liste blanche (méthode, chemin sans paramètres, statut, durée) ; e-mails, mots de passe, jetons, cookies, contenus et paramètres SQL masqués.
- **Sécurité HTTP dès le squelette** : Helmet, politique CSP stricte (le contenu TipTap est rendu sans HTML arbitraire), CORS restreint, limitation de débit globale et par route sensible. L'audit OWASP reste en M6, pas la mise en place.
- **Comptes** : e-mail vérifié, protection contre la force brute et politique de mot de passe côté Keycloak, MFA obligatoire pour les rôles de modération.
- **Écriture concurrente** : chaque brouillon porte un numéro de version ; une sauvegarde sur une version dépassée renvoie 409 et l'éditeur propose de fusionner ou de comparer (aucune perte silencieuse entre co-autrices et co-auteurs).
- **Tâches en arrière-plan** : file de tâches **pg-boss** (dans PostgreSQL, pas de Redis) pour l'indexation Meilisearch, le traitement des images, les e-mails groupés, la compaction des révisions et les suppressions de compte.
- **Médias** : téléversement vers un espace temporaire, puis traitement asynchrone (vérification du type réel, refus des SVG, ré-encodage WebP/AVIF qui supprime les métadonnées) avant publication ; servis depuis un domaine séparé. Avatars et couvertures n'acceptent que des médias internes, jamais une URL externe.
- **Pagination** par curseur sur toutes les listes.
- **Migrations TypeORM** versionnées ; `synchronize` désactivé partout.
- **Comptage des lectures** : une lecture unique par compte connecté et par fenêtre de temps ; pour les visiteurs non connectés, un hachage quotidien salé (adresse + jour) jamais conservé au-delà de la journée. Aucune empreinte de navigateur (traceur au sens de la CNIL).
- **OpenAPI** générée depuis les contrats (conversion JSON Schema de zod), servie sur `/api/docs` hors production uniquement.

### Authentification

- Keycloak reste le fournisseur d'identité (inscription, connexion, mot de passe oublié, MFA, connexion sociale plus tard).
- Le front utilise **Authorization Code + PKCE** (`oidc-client-ts` / `react-oidc-context`).
- L'API **ne parle plus à Keycloak à chaque requête** : elle valide la signature du JWT via le JWKS mis en cache. `keycloak-connect` (déprécié) et `express-session` disparaissent.
- Chaque jeton est vérifié : signature RS256, émetteur, audience `api`, client d'origine (`azp` = `web`), type « Bearer » (pas de jeton d'identité ou de rafraîchissement). Toute route exige un jeton, sauf celles marquées `@Public()` (refus par défaut).
- **Modération et administration** : le rôle ne suffit pas, le jeton doit prouver un code TOTP validé **pendant cette connexion** (claim `amr` contenant `otp`). Une session ouverte par « mot de passe oublié » ou avant l'attribution du rôle n'y donne donc pas accès, sans avoir à fermer les sessions côté Keycloak. Sans cette preuve, ces rôles sont retirés des rôles effectifs de la requête (`rolesAwaitingMfa`) : aucun traitement ne peut s'y fier par erreur. « Mot de passe oublié » ne réinitialise jamais le code TOTP.
- Clés de Keycloak indisponibles : 503 journalisée (la personne n'est pas déconnectée), jamais 401.
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

| Mode                       | Qui écrit dans l'univers                                                                                   | Exemple                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **Solo**                   | Le propriétaire uniquement                                                                                 | Une saga personnelle                 |
| **Collaboratif**           | Les co-auteurs invités, avec un rôle                                                                       | Un projet à quatre mains             |
| **Ouvert sur invitation**  | Des personnes choisies, avec des droits restreints (ex. proposer des fiches, écrire des histoires annexes) | Un cercle d'écriture                 |
| **Fanfictions autorisées** | N'importe qui peut écrire une histoire _dérivée_, rattachée à l'univers mais qui ne modifie pas le canon   | Un univers qui fédère une communauté |

Conséquences sur le modèle :

- `universe_members(universe, user, role)` avec des rôles : `owner`, `coauthor` (édite tout), `contributor` (propose, l'auteur valide). Pas de rôle de bêta-lecture au niveau de l'univers : la bêta-lecture passe uniquement par les cercles (décision 25).
- Les fiches (personnages, lieux, événements) ont un **statut canon / proposition** : les contributions passent par une validation de l'auteur.
- Une histoire a un `canon_status` : `canon` (écrite par l'auteur ou un co-auteur) ou `fanfiction` (dérivée, affichée séparément, avec l'auteur d'origine crédité).
- L'auteur peut **révoquer** l'ouverture aux fanfictions : les fanfictions existantes restent en ligne mais ne sont plus rattachées visiblement à l'univers (choix à affiner).
- Toutes les permissions passent par une seule _policy_ `UniversePolicy`, testée en profondeur.

## 5 ter. Recherche, tags et avertissements

Pensée pour les lectrices et lecteurs de fanfiction (référence : AO3).

**Métadonnées structurées d'une histoire**

- Univers (ou « histoire originale »), **personnages** et **relations** sont des entités, pas du texte libre. Les personnages sont ceux des fiches de l'univers.
- Relation = ensemble de personnages + type : **romantique `/`** ou **platonique / familiale `&`**.
- Classement : Tout public, Ado, Mature (Explicite reporté, décision 22).
- Statut (en cours / terminée), langue, nombre de mots, nombre de chapitres (publiés / prévus).

**Avertissements : modèle mixte**

- Avertissements **majeurs obligatoires** à renseigner : mort de personnage, violence explicite, non-consentement, ou « je préfère ne pas préciser ». Le contenu sexuel impliquant des personnages mineurs n'est **pas** un avertissement : il est interdit par la charte (#37) et relève de la modération urgente.
- Liste **fine et facultative** : deuil, automutilation, troubles alimentaires, etc.
- Les lecteurs excluent par recherche ou de façon permanente (« Mes limites »). « Non précisé » est excluable comme un avertissement.

**Tags et synonymes**

- Tags libres saisis par les auteurs. Normalisation automatique (casse, accents, tirets, espaces) vers un tag existant.
- Les **tags canoniques** regroupent les synonymes (« slowburn », « Slow Burn » → _slow burn_), y compris d'une langue à l'autre. Un sous-tag hérite de son parent.
- Les **jardiniers des tags** (rôle bénévole) fusionnent, renomment et rattachent, avec un journal des opérations. La recherche porte toujours sur le tag canonique.

**Moteur**

- **Meilisearch** auto-hébergé, interrogé **via l'API** (jamais de clé maître côté navigateur) ; seuls les contenus publiés et publics sont indexés.
- **Fandoms d'œuvres publiées** : entité « fandom » **sans propriétaire** (ex. une saga littéraire), avec ses personnages, gérée par les jardiniers des tags ; distincte des univers originaux, qui appartiennent à leurs autrices et auteurs.
- Moteur : facettes avec comptes, inclusion et exclusion, tolérance aux fautes, accents. PostgreSQL reste la source de vérité ; un indexeur synchronise à chaque changement.
- Saisie intelligente : la barre reconnaît personnages, relations (`Ilse/Tomas`, `Ilse & Tomas`), tags et exclusions (`-angst`) et les transforme en filtres.
- Recherches enregistrées et alertes « nouvelle histoire correspondant à ma recherche ».

## 6. Frontend — `apps/web`

**React 19 + Vite + TypeScript**, une seule application, découpée par fonctionnalités et chargée à la demande.

| Brique                 | Choix                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Routage                | React Router (mode framework / data) avec chargement paresseux par route                                                                     |
| Données serveur        | TanStack Query + client généré depuis `packages/contracts`                                                                                   |
| Éditeur                | TipTap (extensions : identifiants de blocs, compteur, focus, commentaires)                                                                   |
| Styles                 | CSS Modules + variables CSS (design tokens) ; ambiances Lueur, Bougie, Indigo et lune, Encre et rouille, chacune en clair et en sombre (#77) |
| Composants accessibles | Radix UI (primitives sans style)                                                                                                             |
| Formulaires            | React Hook Form + zod (mêmes schémas que l'API)                                                                                              |
| Auth                   | `react-oidc-context`                                                                                                                         |
| PWA                    | Service worker pour la lecture hors ligne (plus tard)                                                                                        |

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
- **Tests** : Vitest partout (l'API passe par SWC pour les métadonnées de décorateurs), tests e2e API avec Postgres via Testcontainers, Playwright pour les parcours clés.
- **Commits conventionnels** (déjà en usage) ; changelog généré.
- **Renovate** ou Dependabot pour les mises à jour.

## 8. CI/CD

GitHub Actions, sans déploiement pour l'instant :

1. `ci.yml` sur chaque PR et sur `main` : installation pnpm (avec cache) → lint → vérification des types → tests unitaires → tests e2e API (service Postgres) → build web et API.
2. `docker.yml` : construction des images `api` et `web` sur chaque PR concernée et sur `main` ; **publication sur GitHub Container Registry uniquement sur tag de version `v*`**, et pas avant la réécriture de l'API (décision 31).
3. Plus tard : un workflow de déploiement branché sur la cible choisie (VPS + Docker Compose, Fly.io, Render, Scaleway…).

Protection de `main` : PR obligatoire, CI verte.

## 9. Migration depuis l'existant

Le code actuel est petit : on **reconstruit au bon endroit** plutôt que de tout migrer d'un coup.

1. Socle : pnpm, `infra/`, realm Keycloak corrigé, CI minimale.
2. `apps/api` : nouveau projet NestJS qui reprend entités et routes existantes, sécurisées.
3. `apps/web` : application unique qui reprend lecteur et éditeur, connexion OIDC.
4. Les micro-frontends et le prototype Express sont supprimés : le prototype Express dès le squelette NestJS (#122), les micro-frontends avec le socle de la nouvelle application (#19), qui ne reprend rien de leur code.

## 10. Décisions prises

| #   | Décision                                                                                                                                                                                          | Statut    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 1   | Monorepo unique `EllexArt/Plumiotheca` (historiques conservés)                                                                                                                                    | ✅ fait   |
| 2   | Une seule application web (abandon des micro-frontends)                                                                                                                                           | ✅ validé |
| 3   | Backend NestJS + TypeORM + PostgreSQL                                                                                                                                                             | ✅ validé |
| 4   | Éditeur TipTap, contenu stocké en JSON ProseMirror                                                                                                                                                | ✅ validé |
| 5   | pnpm workspaces + `packages/contracts` (zod partagé)                                                                                                                                              | ✅ validé |
| 6   | Keycloak conservé, validation JWT par JWKS, PKCE côté web                                                                                                                                         | ✅ validé |
| 7   | Stockage S3 : Garage (MinIO archivé) pour les images                                                                                                                                              | ✅ validé |
| 8   | CSS Modules + tokens + Radix (pas de Tailwind)                                                                                                                                                    | ✅ validé |
| 9   | Univers : solo, collaboratif, ouvert sur invitation, fanfictions — au choix du propriétaire                                                                                                       | ✅ validé |
| 10  | Identité « Lampe de chevet », palette Lueur + 3 ambiances au choix                                                                                                                                | ✅ validé |
| 11  | Concept « bibliothèque vivante » avec vocabulaire simple ; notes de lecture en marge discrètes                                                                                                    | ✅ validé |
| 12  | Compteurs publics : lecteurs, en cours de lecture, recommandations                                                                                                                                | ✅ validé |
| 13  | Recherche à facettes avec Meilisearch, personnages et relations structurés                                                                                                                        | proposé   |
| 14  | Avertissements : modèle mixte (majeurs obligatoires + liste fine facultative)                                                                                                                     | ✅ validé |
| 15  | Tags : normalisation automatique + jardiniers des tags bénévoles                                                                                                                                  | ✅ validé |
| 16  | Accessibilité RGAA 4 / WCAG 2.2 AA, incluse dans la définition de « terminé »                                                                                                                     | ✅ validé |
| 17  | Web d’abord : site responsive, ordinateur prioritaire, pas d’application native (PWA plus tard)                                                                                                   | ✅ validé |
| 18  | Aucune messagerie privée ; échanges uniquement publics ou modérés                                                                                                                                 | ✅ validé |
| 19  | Écriture anonyme, âge déclaré, 15 ans minimum, aucune pièce d'identité                                                                                                                            | ✅ validé |
| 20  | Cercles d'entraide : bêta-lecture et défis, sans discussions                                                                                                                                      | ✅ validé |
| 21  | Galerie avec fan arts validés par l'autrice ou l'auteur ; images IA autorisées mais déclarées et filtrables                                                                                       | ✅ validé |
| 22  | Classement maximum « Mature » au lancement ; « Explicite » reporté (preuve de majorité anonyme + avis juridique)                                                                                  | ✅ validé |
| 23  | Modération à trois niveaux (conception, animatrices, équipe) avec décisions motivées et appel                                                                                                     | ✅ validé |
| 24  | Tranche d'âge déclarée (15-17 / 18+) ; Mature visible des 15-17 ans avec avertissements                                                                                                           | ✅ validé |
| 25  | Bêta-lecture uniquement dans les cercles, retours visibles du cercle et signalables                                                                                                               | ✅ validé |
| 26  | Suppression de compte : choix entre effacement et anonymisation des contributions                                                                                                                 | ✅ validé |
| 27  | « J'ai aimé » : compteur privé, visible de l'autrice ou de l'auteur                                                                                                                               | ✅ validé |
| 28  | Fandoms d'œuvres publiées : entité sans propriétaire gérée par les jardiniers des tags                                                                                                            | ✅ validé |
| 29  | Données personnelles conçues dès M1 (inventaire, durées, journaux sans données personnelles, images sans métadonnées)                                                                             | ✅ validé |
| 30  | File de tâches pg-boss ; sécurité HTTP, limitation de débit et durcissement des comptes dès le squelette                                                                                          | proposé   |
| 31  | Pas de bêta publique avant M6 ; aucune image Docker publiée avant la réécriture de l'API                                                                                                          | ✅ validé |
| 32  | Suppression de compte : pour les œuvres partagées, les co-autrices et co-auteurs décident (garder anonymisé ou retirer)                                                                           | ✅ validé |
| 33  | Pseudonyme public stocké dans l'application (modifiable, réattribution après 90 jours) ; l'identifiant Keycloak reste privé                                                                       | ✅ validé |
| 34  | Tranche d'âge déclarée à la première visite dans l'application, pas à l'inscription Keycloak                                                                                                      | ✅ validé |
| 35  | MFA de la modération : codes de secours à l'activation + réinitialisation par un administrateur                                                                                                   | ✅ validé |
| 36  | Suppression de compte depuis l'application (choix effacer / anonymiser), qui supprime ensuite le compte Keycloak                                                                                  | ✅ validé |
| 37  | NestJS 12 (ESM natif), validation zod native (Standard Schema) sans `nestjs-zod`, Vitest au lieu de Jest                                                                                          | ✅ validé |
| 38  | Preuve de MFA par le claim `amr` du jeton (pas seulement le rôle) ; messages de validation traduits côté API                                                                                      | ✅ fait   |
| 39  | E-mail absent de la base de l'application (Keycloak seul, lu au besoin par un compte de service aux droits minimaux) ; UUID v7 par PostgreSQL 18 ; TypeORM 1.x                                    | ✅ validé |
| 40  | « Tout effacer » d'une personne sanctionnée : ligne interne vide conservée 3 ans pour ses décisions de modération et appels (DSA)                                                                 | ✅ validé |
| 41  | Demande de suppression de compte : histoires et contributions masquées du public dès la demande (exécution sous 30 jours)                                                                         | ✅ validé |
| 42  | Première visite : moins de 15 ans déclaré → compte verrouillé (réponse mémorisée) ; pseudonyme de 3 à 30 caractères, un changement par mois, noms officiels réservés                              | ✅ validé |
| 43  | Pseudonymes en alphabet latin (accents compris), chiffres et `._-` pour la v1 ; noms réservés comparés sur un « squelette » (sans séparateurs ni chiffres sosies), aussi pour le nom affiché      | ✅ validé |
| 44  | Historique privé des anciens pseudonymes (compte, pseudonyme, dates), lisible par la modération seule, gardé un an                                                                                | ✅ validé |
| 45  | Compte verrouillé (moins de 15 ans déclarés) : compte Keycloak et ligne supprimés sous 30 jours                                                                                                   | ✅ validé |
| 46  | Coordonnées extérieures permises dans le profil ; la charte interdit de pousser quelqu'un, surtout un ou une mineure, vers des échanges privés ailleurs                                           | ✅ validé |
| 47  | Demande de suppression de compte : choix effacer / anonymiser et export, puis accès coupés immédiatement (ni connexion ni écriture pendant l'exécution)                                           | ✅ validé |
| 48  | Un chapitre vide ne se publie pas ; une annonce s'écrit dans le corps d'un chapitre                                                                                                               | ✅ validé |
| 49  | Réglages de lecture : la personne qui lit peut imposer un alignement standard (texte centré ou justifié) et changer de police (polices pour la dyslexie)                                          | ✅ validé |
| 50  | Avertissements majeurs : choix actif (« Aucun avertissement majeur » à cocher) ; sans choix, rien n'est déclaré et l'histoire ne se publie pas                                                    | ✅ validé |
| 51  | Copie de secours du texte non enregistré : dans la session de l'onglet seulement (effacée à l'enregistrement, à la déconnexion, à la fermeture)                                                   | ✅ validé |
| 52  | Texte des chapitres : isolats bidirectionnels (U+2066-2069) permis pour l'arabe et l'hébreu ; forçage du sens d'écriture (U+202A-202E) interdit                                                   | ✅ validé |
| 53  | Listes imbriquées sur 4 niveaux au plus, blocs sur 8 : limites appliquées dans l'éditeur comme dans l'API                                                                                         | ✅ validé |
| 54  | Reprise de lecture (« Reprendre au chapitre N ») : sur l'appareil, pour les comptes connectés seulement, 50 histoires au plus, effacée à toute fin de session ; rien pour les visites sans compte | ✅ validé |
