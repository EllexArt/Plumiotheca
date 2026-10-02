## Ce que change cette PR

<!-- En quelques lignes : quoi, pourquoi. -->

Closes #

## Comment vérifier

<!-- Étapes pour tester à la main, captures si l'interface change. -->

## Définition de « terminé »

- [ ] Les tests passent et couvrent le changement (y compris les cas refusés)
- [ ] La CI est verte
- [ ] La documentation est à jour si besoin (`docs/`)

### Sécurité et données (si l'API ou les données changent)

- [ ] Chaque route vérifie l'identité **et** le droit d'agir sur l'objet (propriété, rôle)
- [ ] Seuls les champs autorisés sont acceptés (contrat zod) ; aucun `id` ou champ calculé modifiable
- [ ] Aucune donnée privée dans les réponses publiques ni dans les journaux (e-mail, identifiant Keycloak, brouillons)
- [ ] Aucun secret dans le code, les workflows ou les images
- [ ] Migration fournie si le schéma change ; suppression de compte prise en compte

### Accessibilité (si l'interface change)

- [ ] Utilisable entièrement au clavier, focus visible
- [ ] Testé avec un lecteur d'écran (NVDA ou VoiceOver) sur le parcours modifié
- [ ] Chaque bouton, lien et champ a un nom lisible par un lecteur d'écran
- [ ] Contrastes AA vérifiés en clair et en sombre ; lisible à 200 % de zoom
- [ ] Aucune information portée par la seule couleur
- [ ] Images : texte alternatif présent ou image marquée décorative
