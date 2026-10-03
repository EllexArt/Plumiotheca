# Revue tech lead — PR #131 « première visite, pseudonyme, âge déclaré et charte » — 3 octobre 2026

## Verdict

**Bloquant** (avant corrections) : verrou des moins de 15 ans contournable par deux requêtes simultanées, pseudonymes imitant l'équipe (alphabets mélangés) ou invisibles, erreur 500 sur certains pseudonymes. Architecture (refus par défaut, ordre des gardes) jugée bonne.

## Constats et suites

| #   | Gravité | Constat                                                                                  | Suite                                                                                           |
| --- | ------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Élevé   | Verrou « moins de 15 ans » écrasé par une réponse « 18+ » simultanée (19 fois sur 20).   | **Corrigé** : écritures conditionnelles (`age_band IS NULL`), test de course.                   |
| 2   | Élevé   | Imitation de l'équipe : `аdmin` cyrillique, `equipe-plumiotheca`, `p1umiotheca`.         | **Corrigé** : alphabet latin seul (décision 43), noms réservés sur un squelette, « contient ».  |
| 3   | Élevé   | Pseudonyme invisible (U+3164), lettres mathématiques, mélange de sens d'écriture.        | **Corrigé** par l'alphabet latin et la forme NFC.                                               |
| 4   | Moyen   | Erreur 500 : forme normalisée plus longue que la colonne.                                | **Corrigé** : longueur de la forme normalisée contrôlée par le schéma.                          |
| 5   | Élevé   | Données d'un enfant de moins de 15 ans gardées sans limite ; message erroné.             | Décision 45 (suppression sous 30 jours, #70) ; message corrigé ; inventaire des données à jour. |
| 6   | Moyen   | Le garde ignore `deletion_pending` ; suppression inaccessible aux comptes bloqués.       | #70.                                                                                            |
| 7   | Moyen   | Pseudonyme libéré immédiatement à la suppression.                                        | #70.                                                                                            |
| 8   | Moyen   | Ancien pseudonyme sans lien : signalements non rattachables.                             | **Corrigé** : historique privé (décision 44), purge à un an dans #70.                           |
| 9   | Moyen   | Nom affiché sans contrôle (« Équipe de modération Plumiotheca », caractères invisibles). | **Corrigé** : noms réservés et caractères de contrôle refusés.                                  |
| 10  | Moyen   | Test du profil verrouillé sans effet ; tests manquants.                                  | **Corrigé** : 7 tests ajoutés (course, délais, réservés, verrouillé, public avec jeton…).       |
| 11  | Faible  | Charte « à relire » mais déjà exigée ; version non datée.                                | Règle de version documentée ; datation à la validation (#37).                                   |
| 12  | Faible  | Deux messages différents pour le refus d'âge.                                            | **Corrigé** : un seul message.                                                                  |
| 13  | Faible  | Retour arrière de la migration impossible avec un compte verrouillé.                     | **Corrigé** : `down()` vide d'abord la valeur.                                                  |
| 14  | Faible  | « É » décomposé refusé.                                                                  | **Corrigé** : forme NFC.                                                                        |
| 15  | Info    | Tableau des décisions reformaté.                                                         | —                                                                                               |

Charte : complétée (1.5, 2.2, 4.2, 4.3, 4.5, 4.7, 5.5, 6.2-6.4, 7.2-7.4, 8.1) ; conditions d'utilisation, LCEN et DSA article 14 suivis dans #37 ; article 227-24 pour le Mature écrit dans #95.

## Décisions de la propriétaire (3 octobre 2026)

Alphabet latin (43), historique d'un an (44), suppression sous 30 jours des comptes verrouillés (45), coordonnées extérieures permises sans sollicitation (46). Restent ouvertes : identité de l'équipe de modération (#45), droits pendant la demande de suppression (#70).
