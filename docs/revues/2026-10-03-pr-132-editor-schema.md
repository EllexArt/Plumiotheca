# Revue tech lead — PR #132 « packages/editor-schema » — 3 octobre 2026

## Verdict

**Bloquant** (avant corrections) : listes numérotées et retours à la ligne mis en forme refusés alors que l'éditeur les produit ; débordement de pile sur une imbrication profonde ; aucun test avec le vrai éditeur. Objets stricts, absence de pollution `__proto__` et performance jugés bons.

## Constats et suites

| #   | Gravité | Constat                                                                                           | Suite                                                                                              |
| --- | ------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Élevé   | Liste numérotée refusée (`attrs.type` de TipTap 3).                                               | **Corrigé**.                                                                                       |
| 2   | Élevé   | Retour à la ligne en gras ou en italique refusé.                                                  | **Corrigé**.                                                                                       |
| 3   | Élevé   | `RangeError` (pile) vers 437 niveaux d'imbrication.                                               | **Corrigé** : profondeur et nombre de nœuds mesurés sans récursion avant zod ; jamais d'exception. |
| 4   | Élevé   | Pas de test avec le vrai éditeur.                                                                 | **Corrigé** : test de contrat TipTap 3 (dépendance de test seulement), dans les deux sens.         |
| 5   | Moyen   | Citation et listes plus restrictives que l'éditeur ; `listItem` commençant par une liste accepté. | **Corrigé** : alignés sur l'éditeur (citation : blocs ; élément de liste : paragraphe d'abord).    |
| 6   | Moyen   | Demi-paires isolées et forçage du sens d'écriture acceptés.                                       | **Corrigé**.                                                                                       |
| 7   | Moyen   | Erreurs non plafonnées (amplification).                                                           | **Corrigé** : 20 au plus.                                                                          |
| 8   | Moyen   | Doublon d'identifiant : la copie collée au-dessus vole l'identifiant.                             | **Corrigé** : départage avec la version précédente ; extension de l'éditeur à suivre.              |
| 9   | Moyen   | Schéma partiel exporté, limites contournables.                                                    | **Corrigé** : `UncheckedChapterDocument`, `parseDocument` seule porte d'entrée, résultat typé.     |
| 10  | Faible  | Compte de mots faux pour le chinois, le japonais, le thaï.                                        | **Corrigé** : découpage selon la langue pour les écritures sans espaces.                           |
| 11  | Faible  | Image Docker sans `packages/editor-schema`.                                                       | Dans la PR des chapitres.                                                                          |
| 12  | Info    | Limites de 300 000 caractères et de 1 Mo de corps à aligner.                                      | Documenté.                                                                                         |
| 13  | Info    | CI : filtre correct.                                                                              | —                                                                                                  |

## Questions pour la propriétaire du projet

1. Listes et citations imbriquées : alignées sur l'éditeur standard (permises).
2. Texte justifié ou centré choisi par la personne qui écrit : les réglages de lecture doivent-ils pouvoir l'emporter (lisibilité, dyslexie, WCAG 1.4.8) ?
3. Langues sans espaces : prises en compte dès maintenant.
