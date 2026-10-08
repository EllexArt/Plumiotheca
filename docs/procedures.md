# Procédures d'équipe

## Attribuer le rôle de modération ou d'administration

Les rôles `moderation` et `administration` exigent la double authentification (code TOTP, décision 35). Le code doit être **enregistré et vérifié avant** l'attribution du rôle : sinon il serait enregistré à la première connexion avec le rôle, et quiconque contrôle la boîte mail de la personne à ce moment-là pourrait enregistrer le sien (#125).

1. **Compte prêt** : la personne a un compte Plumiotheca, son adresse e-mail est vérifiée et sa première visite est faite.
2. **Enregistrer le code TOTP** : dans la console d'administration de Keycloak (realm `plumiotheca`, « Users », le compte, « Required user actions »), ajouter « Configure OTP ». La personne se connecte depuis **son** appareil et enregistre le code dans son application d'authentification, de préférence en appel avec une administratrice ou un administrateur.
3. **Vérifier** : onglet « Credentials » du compte, une ligne `otp` est présente ; la personne confirme que c'est bien son appareil (nom de l'appareil, heure).
4. **Attribuer le rôle** avec le script, qui refuse tout compte sans code TOTP, désactivé ou à l'e-mail non vérifié, et ferme les sessions ouvertes (leurs jetons n'ont pas le code TOTP) :

   ```bash
   node infra/scripts/role-equipe.mjs attribuer <identifiant> moderation
   ```

5. **Se reconnecter** : la personne se reconnecte avec son mot de passe et son code ; l'API accepte alors ses actions de modération.

Ne pas attribuer ces rôles depuis la console d'administration : elle ne vérifie pas la présence du code.

### Retirer le rôle

```bash
node infra/scripts/role-equipe.mjs retirer <identifiant> moderation
```

Le rôle est retiré et les sessions ouvertes sont fermées.

### Appareil perdu

1. Retirer le rôle (ci-dessus).
2. Dans « Credentials », supprimer la ligne `otp` de la personne, après avoir vérifié son identité par un autre canal que l'e-mail.
3. Reprendre la procédure d'attribution depuis l'étape 2.

« Mot de passe oublié » ne permet jamais de réenregistrer un code TOTP (flux `reinitialisation-plumiotheca`).
