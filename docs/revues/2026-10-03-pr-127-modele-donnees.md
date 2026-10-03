# Revue tech lead — PR #127 « modèle de données MVP et migrations TypeORM » — 3 octobre 2026

## Verdict

**Fusionnable après corrections mineures.** Migration sur base vide, détection d'une migration manquante et arrêt propre sur base injoignable vérifiés. Quatre points du modèle à corriger tant que la migration initiale n'est pas fusionnée.

## Constats et suites

| #   | Gravité | Constat                                                                                              | Suite                                                                                             |
| --- | ------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 1   | Moyen   | `@VersionColumn` ne protège pas des sauvegardes concurrentes (écrasement silencieux, faux conflits). | **Corrigé** : `draft_version` dédiée, `saveDraft()` conditionnel (409), test de deux sauvegardes. |
| 2   | Moyen   | Classement « Tout public » par défaut à la publication.                                              | **Corrigé** : classement NULL par défaut, exigé par contrainte pour publier.                      |
| 3   | Moyen   | La révision publiée pouvait appartenir à un autre chapitre.                                          | **Corrigé** : plus de pointeur ; révision `current` unique par chapitre, forcément publiée.       |
| 4   | Moyen   | Un compte « supprimé » pouvait garder ses données ; test d'anonymisation sans valeur.                | **Corrigé** : contraintes en base, liste centrale des colonnes personnelles vérifiée par test.    |
| 5   | Moyen   | Migrations concurrentes non verrouillées.                                                            | Documenté : tâche unique en production (#67).                                                     |
| 6   | Moyen   | Échec au démarrage affiché par le journal par défaut de Nest (SQL, paramètres).                      | **Corrigé** : aucun journal avant pino, message réduit au type et au code.                        |
| 7   | Faible  | Messages PostgreSQL citant la valeur reçue journalisés.                                              | **Corrigé** : erreurs SQL journalisées par code, contrainte et table ; test UUID invalide.        |
| 8   | Faible  | Test « base injoignable » ne testait pas `main.ts`.                                                  | **Corrigé** : test en sous-processus (code 1, mot de passe témoin absent).                        |
| 9   | Faible  | Valeurs aberrantes acceptées ; tag supprimé retiré des histoires en silence.                         | **Corrigé** : contraintes, `story_tags.tag_id` en RESTRICT.                                       |
| 10  | Faible  | Index manquants sur les clés étrangères, index en double.                                            | **Corrigé**.                                                                                      |
| 11  | Faible  | `DROP DATABASE` de test sans garde-fou.                                                              | **Corrigé** : nom obligatoirement en `_test`.                                                     |
| 12  | Faible  | `down()` jamais testé en CI.                                                                         | **Corrigé** : aller-retour en CI.                                                                 |
| 13  | Info    | Effacement vs décisions de modération (3 ans) ; histoires co-écrites.                                | Question à la propriétaire ; #45, #62, #70.                                                       |
| 14  | Info    | Décision 39 : compte de service Keycloak nécessaire pour les e-mails.                                | Décision 39 complétée ; #33, #70.                                                                 |
| 15  | Info    | Enums : prévoir un état de modération séparé.                                                        | #45.                                                                                              |
| 16  | Info    | TypeORM 1.1 utilise une fonction de pg retirée en v9.                                                | **Corrigé** : Dependabot ignore pg 9.                                                             |

## Questions pour la propriétaire du projet

1. « Tout effacer » d'une personne ayant fait l'objet d'une décision de modération : conserver une ligne interne vide pour garder 3 ans ses décisions et appels (DSA) ?
2. Compte en attente de suppression (30 jours max) : histoires visibles ou masquées dès la demande ?
3. Ancien pseudonyme gardé 90 jours : ajouté au tableau des durées (fait).
4. Compte de service Keycloak lisant les e-mails : implicite dans la décision 39 validée (complétée).
