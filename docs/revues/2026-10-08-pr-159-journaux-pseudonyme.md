# Revue tech lead : PR #159 « pseudonyme vérifié masqué dans les journaux » (8 octobre 2026)

Verdict initial : **approuvable**, une correction mineure recommandée. Test réel (il échoue avec l'ancien `logger.ts`) ; encodages (`%2F`, encodage invalide, lettre encodée) et paramètres sans effet sur le masquage.

| #   | Gravité | Constat                                                                                        | Suite                                                                                       |
| --- | ------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | Mineure | Expression sensible à la casse alors qu'Express ne l'est pas : `/api/Pseudonymes/…` non masqué | **Corrigé** : drapeau `i`, barres multiples et barre finale tolérées ; cas ajoutés au test. |
| 2   | Mineure | Masquage par motif, route par route ; les 404 gardent le chemin brut                           | Accepté pour l'instant (une seule route sensible).                                          |
| 3   | Info    | Journaux d'un futur proxy ou hébergeur hors périmètre                                          | À traiter avec la configuration de production (M6).                                         |
| 4   | Info    | Profil public : pseudonyme journalisé                                                          | Accepté : le pseudonyme y est public.                                                       |
| 5   | Info    | Test sans casse ni barre finale                                                                | **Corrigé**.                                                                                |
