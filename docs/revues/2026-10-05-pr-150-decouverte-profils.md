# Revue tech lead : PR #150 « découverte, reprise de lecture et profils » (5 octobre 2026)

Commit relu : `ebb36d6`. Verdict initial : **changements demandés** (2 points bloquants). Vérifications : typecheck, lint, Prettier, build, tests (158 web, 148 API), 4 sondes et 3 mutations dans une copie jetable.

## Constats et suites données

| #   | Gravité | Constat                                                                                                         | Suite                                                                                                                                                                                                        |
| --- | ------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Majeure | « Voir plus » en échec remplaçait toute la liste par une alerte ; focus perdu (WCAG 2.4.3)                      | **Corrigé** : alerte pleine page seulement si la première page échoue ; sinon la liste reste, alerte annoncée près du bouton qui sert à réessayer (focus conservé). Test ajouté.                             |
| 2   | Majeure | Historique de lecture en `localStorage` pour tout le monde, sans limite ni décision                             | **Décision 54** (propriétaire du projet) : comptes connectés seulement, 50 histoires au plus, effacé à toute fin de session (déconnexion, expiration, compte verrouillé, visite sans compte). Tests ajoutés. |
| 3   | Moyenne | Barre de progression ambre sur piste claire : 1,8:1 (WCAG 1.4.11)                                               | **Corrigé** : couleur d'accent ; paire `accent` / `sunken` ajoutée aux contrôles 3:1.                                                                                                                        |
| 4   | Mineure | Liens de tags de 32 px de haut                                                                                  | **Corrigé** : `var(--target-min)` (44 px).                                                                                                                                                                   |
| 5   | Mineure | Pseudonyme verrouillé 30 jours même pour une retouche de casse ou d'accents (permise par l'API)                 | **Corrigé** : envoi permis si seules la casse ou les accents changent ; date et règle dans l'aide du champ.                                                                                                  |
| 6   | Mineure | Profil : pas de focus sur l'erreur, « nom réservé » dans une alerte générale, succès affiché après modification | **Corrigé** : focus sur le premier champ en erreur, erreur sous « Nom affiché », résultat effacé à la saisie suivante. Test ajouté.                                                                          |
| 7   | Mineure | `/profils/ab` (400) affichait une erreur                                                                        | **Corrigé** : 400 traité comme « Profil introuvable ». Test ajouté.                                                                                                                                          |
| 8   | Mineure | Deux requêtes pour les histoires du profil ; « mien » comparé sans `handleKey`                                  | **Corrigé** : une seule liste (`p.handle`, message vide passé à `StoryList`), comparaison par `handleKey`.                                                                                                   |
| 9   | Mineure | Tests manquants (date du prochain changement, chapitre dépublié, échec de page 2, brouillon tagué)              | **Corrigé** : tests ajoutés ; mutations « liste remplacée » et « mémorisation sans compte » vérifiées tuées.                                                                                                 |
| 10  | Info    | #24 : « moins de 3 clics »                                                                                      | Propriétaire du projet : 3 clics suffisent, #24 fermée par la PR.                                                                                                                                            |
| 11  | Info    | Pas de test au lecteur d'écran                                                                                  | À faire à l'audit M1.                                                                                                                                                                                        |

## Points positifs

- Filtre `tag` de l'API : paramètre lié, index en place, même normalisation que les tags, filtres de visibilité conservés.
- Profil public minimal (contrat strict : ni âge, ni e-mail, ni identifiant Keycloak) ; comptes verrouillés ou sans accueil terminé en 404.
- « Voir plus » qui place le focus sur la première histoire ajoutée, testé pour de bon.
- Noms accessibles soignés ; `<progress>` natif.

## Suites

- « Mes lectures » (M2) : la reprise synchronisée remplacera l'historique local, à effacer à la migration.
- Accessibilité : passer en revue les autres cibles de moins de 44 px (boutons `size="small"`).
