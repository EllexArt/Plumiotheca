# Procédures d'équipe

## Rôles de modération et d'administration

Les rôles `moderation` et `administration` exigent la double authentification (code TOTP, décision 35). Trois protections, toutes nécessaires (#125) :

- le code est **enregistré pendant un appel**, puis vérifié, **avant** l'attribution du rôle ;
- le rôle n'est attribué que par `infra/scripts/role-equipe.mjs`, qui exige **exactement un** code et le fait confirmer ;
- « Mot de passe oublié » est **refusé** à ces comptes, avant tout envoi d'e-mail (flux `reinitialisation-plumiotheca`) : sinon, qui contrôle la boîte mail pourrait ouvrir une session et enregistrer son propre code. La réinitialisation passe par l'administration.

Le script parle au Keycloak de `KEYCLOAK_URL` (`http://localhost:8080` par défaut) avec les identifiants d'administration du realm `master` lus dans `infra/.env`.

### Attribuer le rôle

1. **Compte prêt** : la personne a un compte Plumiotheca, son adresse e-mail est vérifiée et sa première visite est faite. Elle n'a aucun code TOTP (sinon, le supprimer dans « Credentials »).
2. **Pendant un appel** avec une administratrice ou un administrateur : dans la console d'administration de Keycloak (realm `plumiotheca`, « Users », le compte, « Required user actions »), ajouter « Configure OTP ». La personne se connecte **tout de suite**, depuis son appareil, et enregistre le code dans son application d'authentification. Ne pas laisser l'action en attente : quiconque se connecterait avant elle enregistrerait son propre code.
3. **Vérifier** avec le script, toujours pendant l'appel :

   ```bash
   node infra/scripts/role-equipe.mjs attribuer <identifiant> moderation
   ```

   Il refuse un compte désactivé, à l'e-mail non vérifié, avec une action en attente, sans code ou avec plusieurs codes. Sinon il affiche le code (identifiant, nom de l'appareil, date d'enregistrement) : vérifier avec la personne que l'appareil et l'heure correspondent.

4. **Attribuer** en recopiant l'identifiant du code affiché :

   ```bash
   node infra/scripts/role-equipe.mjs attribuer <identifiant> moderation --otp <id-du-code>
   ```

   Les sessions ouvertes sont fermées : la personne se reconnecte avec son mot de passe et son code.

Ne jamais attribuer ces rôles depuis la console d'administration, par un **groupe** ou par un **rôle composite** : ces chemins ne vérifient pas le code.

### Vérifier régulièrement

```bash
node infra/scripts/role-equipe.mjs verifier
```

Liste les personnes qui ont un rôle d'équipe et la date de leur code ; échoue si un groupe ou un rôle composite donne un de ces rôles, ou si une personne n'a pas exactement un code.

### Retirer le rôle

```bash
node infra/scripts/role-equipe.mjs retirer <identifiant> moderation
```

Le rôle est retiré et les sessions sont fermées ; les jetons déjà émis restent valables 5 minutes au plus. Le script échoue si le rôle reste donné par un groupe ou un rôle composite.

### Mot de passe oublié ou appareil perdu

Pas de codes de secours (décision 35 amendée) : tout passe par l'administration.

1. Vérifier l'identité de la personne par un autre canal que l'e-mail.
2. Retirer le rôle (ci-dessus).
3. Mot de passe : dans « Credentials », « Reset password » (mot de passe temporaire transmis par l'autre canal). Appareil perdu : supprimer la ligne `otp`.
4. Reprendre « Attribuer le rôle » depuis l'étape 2.

## Compte de service de l'API (`api-administration`)

Il désactive puis supprime les comptes verrouillés (moins de 15 ans, décision 45). Sa seule permission, « gérer les utilisateurs » (permissions fines de Keycloak), ne permet ni de lister les comptes ni d'attribuer un rôle ; elle permettrait de changer un mot de passe ou de créer un compte : son secret se protège comme celui de la base.

- Production : `KEYCLOAK_ADMIN_CLIENT_SECRET` obligatoire ; l'API joint Keycloak par l'adresse de `KEYCLOAK_JWKS_URL` (adresse interne de préférence : la console d'administration `/admin` n'a pas à être exposée publiquement).
- Au démarrage, l'API vérifie qu'elle obtient un jeton ; sinon, une erreur est journalisée (« Compte de service Keycloak inutilisable »).

### Changer le secret

1. Console d'administration de Keycloak, realm `plumiotheca`, « Clients », `api-administration`, « Credentials », « Regenerate ».
2. Mettre la nouvelle valeur dans `KEYCLOAK_ADMIN_CLIENT_SECRET` et redémarrer l'API (l'ancien jeton en cache est remplacé au premier refus).
3. Vérifier dans le journal de démarrage qu'aucune erreur « Compte de service Keycloak inutilisable » n'apparaît.
