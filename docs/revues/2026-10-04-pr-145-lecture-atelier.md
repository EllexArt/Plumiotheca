# Revue tech lead — PR #145 « feat(web): lire et écrire des histoires » — 4 octobre 2026

Périmètre : commit `be7d9c4` (pages de lecture, atelier avec éditeur simple en texte, script de démonstration). Typecheck, lint, 116 tests et build au vert ; comportements de l'éditeur vérifiés par des tests de sonde montant l'application complète.

## Verdict

**Pas fusionnable en l'état.** Les pages de lecture sont propres (rendu sans HTML brut, séparateur de scène annoncé, cartes accessibles). L'éditeur simple peut perdre du texte de plusieurs façons sans prévenir, et détruit mise en forme et identifiants de blocs à chaque sauvegarde (contraire à l'architecture §5). Bloquants : constats 1 à 7 et 13.

## Constats

| #   | Gravité | Constat                                                                                                                                        |
| --- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Haute   | Course frappe / sauvegarde : un texte tapé pendant un envoi n'est jamais enregistré, et le statut dit « Enregistré ».                          |
| 2   | Haute   | Navigation interne : le texte non enregistré est perdu sans avertissement.                                                                     |
| 3   | Haute   | Cache du brouillon figé : rouvrir le chapitre montre l'ancien texte et toute saisie est refusée (409).                                         |
| 4   | Haute   | Erreurs d'enregistrement jamais affichées ; un conflit n'a pas d'issue sans perte ; aucune copie locale.                                       |
| 5   | Haute   | Aller-retour texte ↔ document destructeur : mise en forme perdue, nouveaux identifiants de blocs à chaque sauvegarde, `draft` de l'API ignoré. |
| 6   | Moyenne | Publier pendant une sauvegarde automatique : faux 409, publication annulée.                                                                    |
| 7   | Moyenne | Brouillon introuvable : chargement sans fin.                                                                                                   |
| 8   | Moyenne | Titre : renommé à chaque sortie du champ, erreur invisible, absent des modifications en attente.                                               |
| 9   | Moyenne | Informations d'une histoire non modifiables après création (une histoire sans classement ne peut jamais être publiée).                         |
| 10  | Moyenne | Aucune case cochée = « aucun avertissement majeur » déclaré sans le vouloir ; « ne pas préciser » écrase en silence les cases cochées.         |
| 11  | Moyenne | « Chapitre suivant » ne ramène pas en haut de la page.                                                                                         |
| 12  | Basse   | Sommaire : nom accessible « 1Un » (pas d'espace entre numéro et titre).                                                                        |
| 13  | Moyenne | Atelier sans tests (sauvegarde, 409, publication, formulaire, axe-core).                                                                       |
| 14  | Basse   | Accords faux dans les messages d'erreur (« Ce chapitre n'a pas pu être chargée »).                                                             |
| 15  | Basse   | Aperçu de la personne propriétaire : numérotation différente du lecteur (brouillons comptés).                                                  |
| 16  | Basse   | Document forcé sans `parseDocument` côté client ; identifiants de blocs utilisés tels quels comme `id` HTML.                                   |
| 17  | Basse   | Collage contenant un caractère de contrôle : refus en boucle, message générique masqué.                                                        |
| 18  | Basse   | Script de démonstration : « idempotence » sur le titre seul ; `API_URL` non limitée à une adresse locale. Aucun secret écrit ni affiché.       |
| 19  | Basse   | Statut « Enregistré à… » annoncé après chaque pause (bruit pour les lecteurs d'écran).                                                         |
| 20  | Basse   | Formulaire en `FormData` + zod au lieu de React Hook Form (architecture §6).                                                                   |

## Questions pour la propriétaire du projet

1. Avertissements majeurs : choix explicite (« Aucun avertissement majeur » à cocher) plutôt qu'une absence de case cochée ?
2. Éditeur simple après #25 : le retirer, ou le garder en secours ?
3. Identifiants de blocs stables dès maintenant ?
4. Copie de secours locale sur un appareil partagé : l'effacer à la déconnexion ?
5. Démonstration sur cette branche ou après corrections ?

## Suites données

L'éditeur simple est **remplacé par l'éditeur TipTap** (#25, ancienne PR #146 intégrée à #145), sur lequel portent les corrections.

| #   | Suite                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Corrigé** : une seule sauvegarde à la fois ; une demande pendant un envoi attend sa fin et part avec la nouvelle version ; test.                                                                                       |
| 2   | **Corrigé** : `useBlocker` (fonction stable) enregistre texte et titre avant de quitter la page ; test.                                                                                                                  |
| 3   | **Corrigé** : cache du brouillon mis à jour après chaque sauvegarde (document, version, mots) et après un renommage ; test.                                                                                              |
| 4   | **Corrigé** : erreurs gardées jusqu'à la réussite suivante, nouvel essai automatique après une erreur passagère, copie de secours locale ; conflit : « Garder ma version » ou « Charger la version enregistrée » ; test. |
| 5   | **Corrigé** par l'éditeur TipTap : mise en forme conservée, identifiants stables (extension `BlockIds`), `draft` de l'API repris.                                                                                        |
| 6   | **Corrigé** : la publication attend la sauvegarde en cours ; bouton indisponible pendant l'envoi ; test.                                                                                                                 |
| 7   | **Corrigé** : erreur avant chargement, avec un lien de retour.                                                                                                                                                           |
| 8   | **Corrigé** : renommage seulement si le titre change, erreur affichée, titre compté dans les modifications en attente.                                                                                                   |
| 9   | **Corrigé** : formulaire commun création / modification (« Modifier les informations ») ; test.                                                                                                                          |
| 10  | **Corrigé** (en attente de la question 1) : « Aucun avertissement majeur » à cocher ; sans choix, rien n'est déclaré (`null`, publication impossible) ; mélange refusé avec un message ; test.                           |
| 11  | **Corrigé** : retour en haut à chaque changement de page, puis focus au contenu sans défilement.                                                                                                                         |
| 12  | **Corrigé** : « Chapitre » masqué et espace entre numéro et titre.                                                                                                                                                       |
| 13  | **Corrigé** : tests de l'atelier (formulaires, sauvegardes, conflit, publication, axe-core).                                                                                                                             |
| 14  | **Corrigé** : libellés complets par cas.                                                                                                                                                                                 |
| 15  | **Corrigé** : rang parmi les chapitres publiés.                                                                                                                                                                          |
| 16  | **Corrigé** : `parseDocument` avant affichage (message de repli) ; ancres préfixées `b-`.                                                                                                                                |
| 17  | En partie : le message de l'API (400) est maintenant affiché. Nettoyage du collage : avec les limites d'imbrication (#134).                                                                                              |
| 18  | **Corrigé** : histoire incomplète supprimée puis recréée ; `API_URL` locale sauf `SEED_ALLOW_REMOTE=1`.                                                                                                                  |
| 19  | **Corrigé** : statut visible mais non annoncé ; seules les erreurs le sont.                                                                                                                                              |
| 20  | Gardé : `FormData` + schéma zod partagé (formulaire non contrôlé, simple) ; écart noté.                                                                                                                                  |

Copie de secours locale effacée à la déconnexion (question 4, appliqué en attendant la réponse).

**Réponses de la propriétaire du projet (4 octobre 2026)** : avertissements majeurs par un choix actif (décision 50, appliqué) ; copie de secours gardée dans la session de l'onglet seulement (`sessionStorage`, décision 51) : effacée à l'enregistrement, à la déconnexion et à la fermeture de l'onglet.

---

# Contre-vérification — 4 octobre 2026 (commits b92e81a, ccf8ceb, 3ceedef)

**Verdict : bloquant.** Le moteur de sauvegarde est solide (sauvegarde unique, cache, blocage de navigation, « Garder ma version » : mutations tuées), mais deux chemins de perte restaient, démontrés par sonde, et deux gardes n'étaient pas protégées par les tests.

| #   | Gravité | Constat                                                                                                                                          | Suite                                                                                                                                                                                                  |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Haute   | Copie de secours ignorée puis écrasée après un conflit ou une frappe pendant un envoi ; « Charger la version enregistrée » perdait mon texte.    | **Corrigé** : copie proposée dès qu'elle diffère (avertissement si elle date d'une version antérieure), réécrite avec la nouvelle version, mon texte mis de côté et proposé après « Charger » ; tests. |
| 2   | Haute   | Collage (forçage du sens d'écriture, caractères de contrôle) ou 5e niveau de liste : refus de l'API pour toujours, message « Requête invalide ». | **Corrigé** : caractères refusés retirés au collage, imbrication bornée dans l'éditeur (`filterTransaction`), raison du refus affichée ; tests.                                                        |
| 3   | Moyenne | Mutations survivantes (frappe pendant l'envoi sans second clic, reprise du document de l'API pendant une frappe, publication, titre, 400…).      | **Corrigé** : tests ajoutés ; la mutation M8 est maintenant tuée.                                                                                                                                      |
| 4   | Moyenne | Identifiants : Entrée en début de paragraphe, glisser-déposer interne, doublons tranchés côté client.                                            | Issue de suivi (avant les notes de lecture).                                                                                                                                                           |
| 5   | Basse   | Reprise du document de l'API : marques en attente perdues, étape d'annulation fantôme.                                                           | **Corrigé** (transaction hors historique, sélection et marques gardées).                                                                                                                               |
| 6   | Basse   | Enregistrement impossible : les liens internes « ne marchent plus ».                                                                             | **Corrigé** : confirmation « Quitter quand même ? » (le texte reste dans l'onglet).                                                                                                                    |
| 7   | Basse   | Déconnexion sans avertissement de texte non enregistré.                                                                                          | Issue de suivi.                                                                                                                                                                                        |
| 8   | Basse   | Raccourcis annoncés en Ctrl sur Mac.                                                                                                             | **Corrigé** (Cmd sur les appareils Apple).                                                                                                                                                             |
| 9   | Basse   | Script : une histoire publiée pouvait être supprimée.                                                                                            | **Corrigé** : seul un brouillon incomplet est recréé.                                                                                                                                                  |
| 10  | Info    | Commentaire inexact sur `onUpdate`.                                                                                                              | **Corrigé**.                                                                                                                                                                                           |
