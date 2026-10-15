# Revue tech lead : PR #163 « suppression des comptes verrouillés après 30 jours » (11 octobre 2026)

Verdict initial : **changements demandés** (1 point bloquant). Vérifications : typecheck, lint, tests API, `check-realm.mjs`, migration en aller-retour, sondes contre Keycloak (droits réels du compte de service, permissions fines sur un realm jetable), 9 mutations.

## Constat bloquant

Avec le rôle `manage-users`, le compte de service pouvait bien plus que supprimer des comptes : lister tous les comptes et leurs e-mails, changer le mot de passe de n'importe qui, lire les codes TOTP, **s'attribuer le rôle `administration`**. Le secret de l'API aurait suffi à prendre le contrôle des comptes ; documentation et vérification affirmaient le contraire.

**Corrigé** (choix de la propriétaire du projet) : aucun rôle d'administration, une **permission fine** (FGAP v2) « gérer les utilisateurs ». Vérifié contre Keycloak et dans `check-realm.mjs` : liste des comptes, lecture d'un compte ou de ses identifiants, attribution de rôle et lecture des clients **refusées (403)** ; désactivation, déconnexion et suppression autorisées. Limite connue, documentée : changement de mot de passe et création de compte restent possibles.

## Autres constats et suites

| #   | Gravité        | Constat                                                                    | Suite                                                                                                                                           |
| --- | -------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 2   | Moyenne        | Un compte en échec bloquait tout le lot, chaque nuit                       | **Corrigé** : échec par compte, les autres continuent ; la tâche échoue à la fin (rejouée). Test.                                               |
| 3   | Moyenne        | Adresse du serveur tronquée en silence ; panne vue seulement à 3 h         | **Corrigé** : adresses vérifiées au chargement (`/realms/<realm>`) ; jeton tenté au démarrage, erreur journalisée sinon.                        |
| 4   | Moyenne        | Client HTTP non testé ; mutations survivantes (route, 404, cache, seuils…) | **Corrigé** : tests unitaires du client (URL, jeton réutilisé, 404, 401 puis jeton neuf, désactivation) ; seuils 29 et 31 jours.                |
| 5   | Faible-moyenne | Un jeton encore valide (5 min) recréait un compte vierge après la purge    | **Corrigé** (choix de la propriétaire) : **purge en deux temps**, désactivation et déconnexion puis suppression au moins une heure après. Test. |
| 6   | Faible         | 401 sans renouvellement du jeton ; réponse de jeton non validée            | **Corrigé**.                                                                                                                                    |
| 7   | Faible         | Lots fixes, délai d'expiration de la file                                  | **Corrigé** : boucle jusqu'à épuisement avec un budget de 10 min, expiration de la tâche à 30 min.                                              |
| 8   | Faible         | Contrainte à sens unique (date posée sur un compte non verrouillé)         | **Corrigé** : équivalence « verrouillé ⇔ daté », suppression commencée seulement si daté. Test.                                                 |
| 9   | Faible         | `down` puis `up` remet le délai à zéro                                     | Documenté dans la migration.                                                                                                                    |
| 10  | Faible         | Postes existants : client absent du realm ; fichier `.env` non restreint   | **Corrigé** : `keycloak-service.mjs` crée le client manquant (sans effacer de données) ; `chmod 600`.                                           |
| 11  | Info           | Pas de procédure de rotation du secret                                     | **Corrigé** : `docs/procedures.md`.                                                                                                             |
