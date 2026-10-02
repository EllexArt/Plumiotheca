# Revue tech lead — PR #122 « feat(api): squelette NestJS 12 et contrats zod partagés » — 2 octobre 2026

## Verdict

**Fusionnable après corrections mineures.** Squelette solide et vérifié (typecheck, build, tests, lint, image Docker en utilisateur `node`, refus de démarrer sans `CORS_ORIGINS`, `/api/docs` absent en production). Deux corrections recommandées avant fusion : masquage des journaux limité au premier niveau (constat 1) et erreurs « JSON illisible » / « trop volumineux » sans identifiant de requête ni journal (constat 2).

## Constats

| #   | Gravité | Catégorie              | Où                                    | Constat                                                                                                                                                                                                | Recommandation                                                                                       | Bloquant ? |
| --- | ------- | ---------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ---------- |
| 1   | Moyen   | Sécurité (journaux)    | `apps/api/src/common/logger.ts`       | Masquage sur un seul niveau : `err.driverError.detail` (« Key (email)=(…) already exists »), `ctx.user.email`, variantes `accessToken`, `refresh_token`, `secret`, `apiKey`, `body`, `text`… en clair. | Sérialiseur `err` en liste blanche, masquage à deux niveaux, variantes de jetons et contenus, tests. | Recommandé |
| 2   | Moyen   | Journaux, support      | `apps/api/src/setup.ts`               | Helmet, CORS et lecture du corps passent avant pino-http : 400 (JSON invalide) et 413 sans `X-Request-Id`, sans `requestId`, sans journal.                                                             | Créer l'identifiant dans le premier middleware ; tester `requestId` sur 400 et 413.                  | Recommandé |
| 3   | Moyen   | Sécurité, exploitation | `env.ts`, `Dockerfile`                | `TRUST_PROXY=0` par défaut : derrière un proxy, limite partagée par tout le site ; avec `TRUST_PROXY=1` et l'API exposée, `X-Forwarded-For` falsifiable.                                               | `TRUST_PROXY` obligatoire en production ; API joignable seulement par le proxy (#67).                | Non        |
| 4   | Moyen   | Erreurs                | `apps/api/src/common/problem.ts`      | Toute erreur avec `status` 4xx (client HTTP vers Keycloak, S3…) devient une erreur « personne », non journalisée.                                                                                      | Ne retenir que les erreurs de lecture du corps (`expose`, `type` en `entity.`…).                     | Non        |
| 5   | Faible  | Accessibilité          | `problem.ts`                          | Messages de validation zod en anglais.                                                                                                                                                                 | `z.config(z.locales.fr())` dans les contrats, ou traduction côté web à partir de `code`.             | Non        |
| 6   | Faible  | Débit                  | `app.module.ts`                       | Le throttler (guard) ne limite pas les routes inconnues ni la lecture des corps.                                                                                                                       | Limite au niveau du proxy (#48, #67).                                                                | Non        |
| 7   | Faible  | Docker                 | `apps/api/Dockerfile`                 | `dist/dist` en double ; typescript 6 (pair de swagger), swagger-ui, npm, yarn, corepack dans l'image ; base non figée par empreinte.                                                                   | Supprimer le `cp`, retirer npm/yarn/corepack, figer la base.                                         | Non        |
| 8   | Faible  | Fonctionnel            | `docs/architecture.md`, prototype web | Express supprimé avant la parité : le prototype web ne trouve plus `/api/stories`.                                                                                                                     | Acter le choix dans l'architecture.                                                                  | Non        |
| 9   | Faible  | CSP                    | `setup.ts`                            | CSP de la documentation appliquée à tout chemin commençant par `/api/docs` ; reprend `font-src https: data:`.                                                                                          | Chemins exacts ; `useDefaults: false`.                                                               | Non        |
| 10  | Info    | Journaux               | `logger.ts`                           | `X-Request-Id` du client accepté sans proxy de confiance ; paramètres de chemin journalisés.                                                                                                           | Accepter l'en-tête seulement si `TRUST_PROXY > 0` ; jamais de donnée personnelle dans les URL.       | Non        |
| 11  | Info    | Erreurs                | `problem.ts`                          | 406, 410, 422… renvoient « requete-invalide ».                                                                                                                                                         | Compléter le tableau ou type générique.                                                              | Non        |
| 12  | Info    | Hygiène                | `.prettierignore`, `.env.example`     | `apps/api/postman` encore ignoré ; `TRUST_PROXY`, `RATE_LIMIT_PER_MINUTE` absents de l'exemple.                                                                                                        | Nettoyer.                                                                                            | Non        |

## Points positifs

- Réponses problem+json sans pile ni SQL vérifiées (400, 413, 404, 500), Helmet strict, CORS limité sans cookies.
- Configuration validée sans afficher les valeurs ; écoute sur 127.0.0.1 par défaut.
- Image multi-étapes, utilisateur `node`, sans devDependencies, arrêt propre sur SIGTERM.
- Tests pertinents ; lint avec types actif, `eslint-suppressions.json` supprimé.
- Validation native NestJS 12 plutôt que `nestjs-zod` : pile plus simple.

## Questions pour la propriétaire du projet

1. Valider explicitement la décision 37 (NestJS 12, sans `nestjs-zod`, Vitest).
2. Accepter que le prototype web ne fonctionne plus avec l'API d'ici #19.
3. Messages de validation traduits côté API ou côté web ?

## Issues à créer ou mettre à jour

- #9 : critère « base injoignable » reporté à #13 (fait).
- #10 : retirer « intégration nestjs-zod » ; « le web importe les types » reste ouvert (#19).
- #13 : une erreur de contrainte PostgreSQL ne fait apparaître aucune valeur dans les journaux.
- #67 : `TRUST_PROXY` en production, API joignable seulement par le proxy, limites de débit et de taille au proxy.
- Créer : image API allégée et base figée (M6, P3).

## Suites données (même jour)

Corrigés dans la PR : 1, 2, 3 (`TRUST_PROXY` obligatoire en production), 4, 5 (zod en français), 7 (doublon `dist`, npm/yarn/corepack retirés), 8, 9, 10, 11, 12. Reportés : 6 (#67), reste du 7 (issue dédiée).
