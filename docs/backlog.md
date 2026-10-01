# Backlog Plumiotheca

> Source de vérité : le [tableau GitHub Projects](https://github.com/users/EllexArt/projects/2). Ce fichier est l'instantané initial (octobre 2026).

Priorités : **P0** indispensable au jalon, **P1** important, **P2** bonus. Tailles : XS < S < M < L < XL.

## M0 — Socle (8)

_Monorepo, outillage, infra de dev, CI. Rien de visible pour l'utilisateur, mais tout le reste en dépend._

| Prio | Taille | Zones | Tâche |
|---|---|---|---|
| P0 | S | infra | Monorepo pnpm : workspaces, scripts racine, versions Node épinglées |
| P0 | S | infra | ESLint + Prettier + EditorConfig partagés |
| P0 | M | infra | Infra de dev : docker-compose (Postgres, Keycloak, MinIO, Mailpit) |
| P0 | S | infra, auth | Realm Keycloak valide et versionné |
| P0 | M | ci | CI GitHub Actions : lint, typecheck, tests, build |
| P1 | S | ci | CI : images Docker api et web publiées sur GHCR |
| P1 | XS | ci | Protection de main, modèles d'issue et de PR, Dependabot/Renovate |
| P2 | XS | infra | Nettoyage : .idea, LICENSE en double, fichiers morts (src/bin/www) |

## M1 — MVP : écrire, publier, lire (22)

_Le premier parcours complet de bout en bout, propre et sécurisé._

| Prio | Taille | Zones | Tâche |
|---|---|---|---|
| P0 | M | api | API : squelette NestJS (config, logs, erreurs, OpenAPI, healthcheck) |
| P0 | M | api, web | packages/contracts : schémas zod partagés + client typé |
| P0 | M | api, auth | API : authentification JWT (JWKS Keycloak), guard global, @Public() |
| P0 | M | api | API : utilisateurs et profils publics (pseudonyme unique) |
| P0 | M | api | API : migrations TypeORM et modèle de données MVP |
| P0 | L | api | API : histoires (CRUD sécurisé, statuts, tags, pagination) |
| P0 | M | editor, web, api | packages/editor-schema : schéma TipTap partagé + identifiants de blocs |
| P0 | L | api | API : chapitres (contenu JSON, brouillon vs publié, réordonnancement) |
| P0 | L | web, auth | Web : nouvelle application unique (routing, layout, thème, auth OIDC PKCE) |
| P0 | M | design, web | Design system v1 : tokens, typographie, composants de base |
| P0 | M | web | Web : page d'accueil et découverte (dernières histoires, tags) |
| P0 | M | web | Web : page histoire (fiche, sommaire, auteur, bouton lire) |
| P0 | L | web, reader | Web : lecteur de chapitre v1 (typographie soignée, navigation) |
| P0 | M | web | Web : tableau de bord auteur (mes histoires, brouillons) |
| P0 | L | web, editor | Web : éditeur de chapitre TipTap v1 (sauvegarde automatique) |
| P0 | M | design | Maquettes : identité visuelle (palette, typographies, ton) |
| P0 | M | design | Maquettes : parcours lecteur (accueil, fiche histoire, lecteur, réglages) |
| P0 | M | design | Maquettes : parcours écrivain (tableau de bord, éditeur, publication) |
| P1 | S | api | API : comptage des lectures uniques |
| P1 | M | api, infra | API : upload d'images (couvertures, avatars) via URL pré-signée |
| P1 | M | web | Web : profil public et paramètres du compte |
| P1 | M | web, ci | Tests e2e Playwright du parcours écrire → publier → lire |

## M2 — Lecture confortable (9)

_Tout ce qui rend la lecture agréable et donne envie de revenir._

| Prio | Taille | Zones | Tâche |
|---|---|---|---|
| P0 | M | web, reader | Réglages de lecture (police, taille, interligne, largeur, thèmes clair/sombre/sépia) |
| P0 | M | api, web, reader | Reprise de lecture au paragraphe près |
| P0 | M | api, web | Bibliothèque et listes de lecture |
| P1 | M | api, web | Recherche plein texte (titres, résumés, tags, auteurs) |
| P1 | M | api, web | Découverte : filtres avancés et tri (langue, statut terminé, longueur, avertissements) |
| P1 | M | api, web | Notifications de nouveaux chapitres (in-app + e-mail digest) |
| P1 | M | web, reader | Accessibilité du lecteur (lecteurs d'écran, police dyslexie, réduction des animations) |
| P2 | S | api, web | Statistiques de lecture côté lecteur (temps, histoires terminées) |
| P2 | L | web, reader | PWA et lecture hors ligne des chapitres téléchargés |

## M3 — Communauté et modération (12)

_Échanger, suivre, réagir — dans un cadre sain par construction._

| Prio | Taille | Zones | Tâche |
|---|---|---|---|
| P0 | S | product | Charte de la communauté et conditions d'utilisation |
| P0 | M | api, web | Abonnements aux auteurs et fil d'actualité |
| P0 | L | api, web | Commentaires de chapitre (fils, réponses, édition, suppression) |
| P0 | L | api, web, reader | Commentaires par paragraphe (annotations en marge) |
| P0 | M | api, web, moderation | Modération : signalements de contenus et d'utilisateurs |
| P0 | M | api, web, moderation | Modération : blocage et mise en sourdine |
| P0 | L | api, web, moderation | Modération : outils modérateurs (rôles, file, actions, journal) |
| P0 | M | api, web | Avertissements de contenu et classification par âge |
| P1 | S | api, web | Likes (votes) sur les chapitres |
| P1 | M | api, web | Notifications sociales (réponses, mentions, nouveaux abonnés) |
| P1 | S | api, web, moderation | Auteur : modération de ses propres commentaires |
| P1 | M | api, moderation | Protection anti-abus (limitation de débit, anti-spam) |

## M4 — Atelier d'écriture (8)

_Les outils qui accompagnent l'écrivain au quotidien._

| Prio | Taille | Zones | Tâche |
|---|---|---|---|
| P0 | L | api, web, editor | Historique des versions d'un chapitre et comparaison |
| P1 | M | api, web, editor | Objectifs d'écriture et statistiques auteur |
| P1 | S | web, editor | Mode concentration (plein écran, machine à écrire, minuteur) |
| P1 | L | api, web, editor | Notes et plan du projet (structure, scènes, post-it) |
| P1 | L | api, web, editor | Bêta-lecteurs : partage de brouillons et retours privés |
| P2 | S | api, web | Planification de publication |
| P2 | L | api, web, editor | Import (DOCX, Markdown) et export (EPUB, PDF) |
| P2 | L | web, editor | Aides à l'écriture : répétitions, longueur des phrases, dictionnaire de synonymes |

## M5 — Univers (9)

_Wiki d'univers, collaboration et fanfictions._

| Prio | Taille | Zones | Tâche |
|---|---|---|---|
| P0 | M | api, web, universe | Univers : création, rattachement des histoires, page publique |
| P0 | L | api, web, universe | Fiches d'univers : personnages, lieux, objets, factions (wiki) |
| P0 | L | api, web, universe | Membres et rôles d'univers (co-auteurs, contributeurs, bêta) |
| P0 | M | api, web, universe | Modes d'ouverture : solo, collaboratif, sur invitation |
| P1 | M | web, editor, reader, universe | Mentions de fiches dans l'éditeur et infobulles dans le lecteur |
| P1 | L | api, web, universe | Chronologie de l'univers |
| P1 | M | api, web, universe | Gestion anti-divulgâchage des fiches |
| P1 | L | api, web, universe | Contributions proposées et validation canon |
| P1 | L | api, web, universe | Fanfictions : ouverture, rattachement, crédit, révocation |

## M6 — Mise en production (7)

_Héberger, sauvegarder, surveiller, respecter le RGPD._

| Prio | Taille | Zones | Tâche |
|---|---|---|---|
| P0 | S | infra, product | Choix de l'hébergement et estimation des coûts |
| P0 | M | ci, infra | Pipeline de déploiement (staging puis production) |
| P0 | S | infra | Sauvegardes et restauration de la base |
| P0 | M | api, web, product | RGPD : export et suppression de compte, politique de confidentialité |
| P0 | M | api, web, infra | Sécurité : en-têtes HTTP, CSP, audit de dépendances, revue OWASP |
| P1 | M | infra, api, web | Observabilité : logs, métriques, erreurs (Sentry ou équivalent) |
| P1 | S | infra, api | E-mails transactionnels (fournisseur, modèles, domaine) |
