# Revue tech lead : PR #151 « Avant de publier » et avertissements facultatifs (5 octobre 2026)

Verdict initial : **fusionnable après corrections** (constats 1 à 4 bloquants). Vérifications : format, lint, typecheck, 387 tests, 5 sondes, aller-retour de la migration, 17 mutations (7 tuées, 10 survivantes).

## Constats et suites données

| #   | Gravité | Constat                                                                                                   | Suite                                                                                                                              |
| --- | ------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Haute   | Avertissements lus « manquants » dès qu'un autre champ était invalide ; fausse erreur, focus faux         | **Corrigé** : lecture directe des avertissements ; erreur seulement s'ils manquent vraiment. Test (tag trop long) ; mutation tuée. |
| 2   | Moyenne | Le PATCH renvoyait titre, résumé et langue repris du cache                                                | **Corrigé** : seulement classement, avertissements et tags. Test (corps exact) ; mutation tuée.                                    |
| 3   | Moyenne | Après publication, focus perdu                                                                            | **Corrigé** : focus sur le message de réussite. Test ; mutation tuée.                                                              |
| 4   | Moyenne | Mutations survivantes (création, lecture, vue « déjà publiée », cases pré-cochées, erreur du classement…) | **Corrigé** : tests ajoutés pour chacune.                                                                                          |
| 5   | Moyenne | Un rechargement en échec remplaçait la page                                                               | **Corrigé** : erreur pleine page seulement sans données.                                                                           |
| 6   | Moyenne | Même message si l'enregistrement ou la publication échoue                                                 | **Corrigé** : deux messages, effacés à la saisie suivante. Test.                                                                   |
| 7   | Moyenne | Double clic : double envoi possible                                                                       | **Corrigé** : garde synchrone (le bouton bloquait déjà le second clic dans les tests).                                             |
| 8   | Moyenne | « Aussi : … » ambigu                                                                                      | **Corrigé** : « Autres avertissements : … ».                                                                                       |
| 9   | Basse   | Bouton `aria-disabled` à 2,7:1 (opacité)                                                                  | **Corrigé** : couleurs dédiées (paire `text-soft` / `sunken`, 4,5:1 contrôlée) pour tous les boutons `aria-disabled`.              |
| 10  | Basse   | Aides des groupes non reliées ; erreur sur la dernière case                                               | **Corrigé** : `aria-describedby` sur les groupes, erreur et focus sur la première case.                                            |
| 11  | Basse   | Aperçu avec effet de survol                                                                               | **Corrigé**.                                                                                                                       |
| 12  | Basse   | Tags de l'aperçu non dédoublonnés                                                                         | **Corrigé** (sans tenir compte de la casse).                                                                                       |
| 13  | Basse   | Ordre des avertissements selon les clics                                                                  | **Corrigé** : toujours dans l'ordre de la liste (contrat). Test API.                                                               |
| 14  | Basse   | Type enum PostgreSQL alors que la liste est à valider                                                     | Gardé : ajouter une valeur reste une migration simple. À revoir si la décision 55 change la liste.                                 |
| 15  | Basse   | Aucune migration testée en retour arrière                                                                 | Suite : issue à créer (test générique de retour arrière).                                                                          |
| 16  | Basse   | Vue « déjà publiée » pour l'histoire de quelqu'un d'autre                                                 | **Corrigé** : « Histoire introuvable ». Test.                                                                                      |
| 17  | Basse   | Tableau des décisions reformaté par Prettier                                                              | Inévitable avec Prettier ; conflits réglés à la fusion.                                                                            |
| 18  | Info    | FormData + zod plutôt que React Hook Form                                                                 | À trancher pour tout le projet.                                                                                                    |

## Questions pour la propriétaire du projet

1. Décision 55 : liste des 8 avertissements facultatifs et libellés.
2. Filtre de lecture (« masquer les histoires avec… ») sur ces avertissements : quel jalon ?
3. La charte doit-elle mentionner les avertissements facultatifs ?
