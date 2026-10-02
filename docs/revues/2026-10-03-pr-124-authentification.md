# Revue tech lead — PR #124 « authentification de l'API par jetons Keycloak et MFA de la modération » — 3 octobre 2026

## Verdict

**Bloquant** (avant corrections). La garde de l'API résiste à toutes les tentatives de jeton forgé ou détourné. Mais la preuve de MFA ne tenait pas en conditions réelles, et « mot de passe oublié » permettait d'enregistrer un nouveau code TOTP.

## Constats

| #   | Gravité  | Où                          | Constat                                                                                                                                                                        | Suite                                                                                                       |
| --- | -------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| 1   | Critique | `keycloak-realm.mjs` (AMR)  | Sans `default.reference.maxAge`, Keycloak tient les valeurs AMR pour expirées en 0 s : `otp` disparaît au renouvellement, à la reconnexion SSO, parfois dès l'échange du code. | **Corrigé** : validité = durée de session (10 h) ; `check-realm` vérifie renouvellement et SSO après 2,5 s. |
| 2   | Élevé    | flux « reset credentials »  | « Mot de passe oublié » d'un modérateur équipé propose d'enregistrer un nouveau TOTP : la boîte mail suffit à obtenir `mfa: true`.                                             | **Corrigé** : flux `reinitialisation-plumiotheca` sans réinitialisation TOTP ; test du modérateur équipé.   |
| 3   | Moyen    | `token-verifier.ts`         | Clés Keycloak en erreur HTTP ou illisibles → 401 sans journal ; cache de 10 min sans repli.                                                                                    | **Corrigé** : 401 seulement pour les erreurs du jeton ; sinon 503 journalisée + `Retry-After` ; cache 1 h.  |
| 4   | Moyen    | `auth.guard.ts`, `AuthUser` | `user.roles` contient `moderation` même sans MFA : risque dès qu'une route s'y fie.                                                                                            | **Corrigé** : rôles effectifs + `rolesAwaitingMfa` ; tests.                                                 |
| 5   | Moyen    | `check-realm.mjs`           | Échange du code dans la seconde : ne pouvait pas voir le n° 1, et instable.                                                                                                    | **Corrigé** avec le n° 1 (deux exécutions conformes d'affilée).                                             |
| 6   | Faible   | `env.ts`                    | `http` accepté pour l'émetteur et les clés en production.                                                                                                                      | Issue de suivi.                                                                                             |
| 7   | Faible   | `auth.module.ts`            | Rotation de clé : jeton refusé jusqu'à 30 s si la clé est utilisée avant d'être publiée.                                                                                       | Accepté (Keycloak publie les clés passives avant usage).                                                    |
| 8   | Info     | garde globale               | Routes inconnues : 404 avant authentification (énumération possible).                                                                                                          | Accepté.                                                                                                    |
| 9   | Info     | #120                        | « Fermer les sessions à l'attribution du rôle » remplacé par l'exigence `otp` dans chaque jeton.                                                                               | À confirmer par la propriétaire.                                                                            |
| 10  | Info     | `docs/architecture.md`      | Décision 37 passée à « validé ».                                                                                                                                               | Validée par la propriétaire le 2 octobre.                                                                   |

Vérifié correct : refus de `alg none`, confusion HS256/clé publique, `kid` inconnu, `jwk` embarqué, `crit`, JWE, contenu modifié, jetons d'identité et de rafraîchissement ; en-têtes malformés ; actions requises par e-mail sans session ; aucun secret dans le JSON du realm.

## Questions pour la propriétaire du projet

1. Remplacer « fermer les sessions à l'attribution du rôle » (#120) par l'exigence d'un code TOTP dans chaque jeton ?
2. Un modérateur qui perd son appareil ne peut jamais réinitialiser sa MFA lui-même par e-mail (conforme à la décision 35) ?
3. Imposer « TOTP configuré d'abord, rôle attribué ensuite » dans la procédure d'équipe ?
4. Durée de validité de la preuve MFA : toute la session (10 h, choix actuel) ou moins (ex. 1 h) ?

## Issues

- Créées : procédure d'attribution du rôle de modération (TOTP d'abord) ; `https` obligatoire pour l'émetteur et les clés en production.
