// Génère infra/keycloak/realm-plumiotheca.json à partir d'un Keycloak en marche.
//
// Le realm n'est jamais écrit à la main : ce script le configure via l'API
// d'administration (source de vérité lisible), puis l'exporte. Pour le régénérer :
//   pnpm infra:reset && pnpm infra:up && node infra/scripts/keycloak-realm.mjs
// (avec un dossier infra/keycloak sans realm, pour partir d'un Keycloak vierge).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminClient, root, REALM } from './keycloak-admin.mjs';

const kc = await adminClient();
const R = `/${REALM}`;

// 1. Realm : inscription ouverte, e-mail vérifié, pseudonyme distinct de l'e-mail,
//    protection contre la force brute, politique de mot de passe, français par défaut.
await kc.post('', { realm: REALM, enabled: true });
await kc.put(R, {
  displayName: 'Plumiotheca',
  registrationAllowed: true,
  registrationEmailAsUsername: false,
  loginWithEmailAllowed: true,
  duplicateEmailsAllowed: false,
  verifyEmail: true,
  resetPasswordAllowed: true,
  rememberMe: true,
  editUsernameAllowed: false,
  bruteForceProtected: true,
  permanentLockout: false,
  failureFactor: 5,
  waitIncrementSeconds: 60,
  maxFailureWaitSeconds: 900,
  minimumQuickLoginWaitSeconds: 60,
  quickLoginCheckMilliSeconds: 1000,
  maxDeltaTimeSeconds: 43200,
  passwordPolicy:
    'length(10) and maxLength(128) and notUsername and notEmail and passwordHistory(3)',
  internationalizationEnabled: true,
  supportedLocales: ['fr', 'en'],
  defaultLocale: 'fr',
  accessTokenLifespan: 300,
  ssoSessionIdleTimeout: 1800,
  ssoSessionMaxLifespan: 36000,
  revokeRefreshToken: true,
  refreshTokenMaxReuse: 0,
  // Développement : Mailpit capture les e-mails (http://localhost:8025).
  smtpServer: {
    host: 'mailpit',
    port: '1025',
    from: 'ne-pas-repondre@plumiotheca.localhost',
    fromDisplayName: 'Plumiotheca',
    auth: 'false',
    ssl: 'false',
    starttls: 'false',
  },
  // En-têtes de sécurité des pages de connexion.
  browserSecurityHeaders: {
    contentSecurityPolicy: "frame-src 'self'; frame-ancestors 'self'; object-src 'none';",
    xFrameOptions: 'SAMEORIGIN',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'no-referrer',
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
  },
});

// 1 bis. Profil utilisateur minimal : ni prénom ni nom (écriture sous pseudonyme,
//        minimisation des données). Seuls le nom d'utilisateur et l'e-mail existent.
const profile = await kc.get(`${R}/users/profile`);
profile.attributes = profile.attributes.filter((a) => !['firstName', 'lastName'].includes(a.name));
// Le nom d'utilisateur ne peut pas être une adresse e-mail (ni contenir @) : il apparaît
// dans les jetons (preferred_username) et ne doit jamais révéler l'adresse.
const username = profile.attributes.find((a) => a.name === 'username');
username.validations = {
  ...username.validations,
  pattern: {
    pattern: '^[\\p{L}\\p{N}._-]+$',
    'error-message':
      'Lettres, chiffres, point, tiret et tiret bas uniquement (pas d’adresse e-mail).',
  },
};
await kc.put(`${R}/users/profile`, profile);

// 2. Rôles de la plateforme.
for (const [name, description] of [
  ['moderation', 'Équipe de modération de Plumiotheca (MFA obligatoire)'],
  ['administration', 'Administration de Plumiotheca (MFA obligatoire)'],
  ['jardinage-tags', 'Jardiniers des tags (bénévoles)'],
]) {
  await kc.post(`${R}/roles`, { name, description });
}

// 3. Client « api » : cible d'audience des jetons, aucun flux de connexion.
await kc.post(`${R}/clients`, {
  clientId: 'api',
  name: 'API Plumiotheca',
  protocol: 'openid-connect',
  publicClient: false,
  bearerOnly: true,
  standardFlowEnabled: false,
  implicitFlowEnabled: false,
  directAccessGrantsEnabled: false,
  serviceAccountsEnabled: false,
});

// 4. Client « web » : application publique, code d'autorisation + PKCE obligatoire,
//    pas de connexion par mot de passe direct, origines limitées.
const devOrigins = ['http://localhost:5173'];
await kc.post(`${R}/clients`, {
  clientId: 'web',
  name: 'Application web Plumiotheca',
  protocol: 'openid-connect',
  publicClient: true,
  standardFlowEnabled: true,
  implicitFlowEnabled: false,
  directAccessGrantsEnabled: false,
  serviceAccountsEnabled: false,
  frontchannelLogout: true,
  redirectUris: devOrigins.map((o) => `${o}/*`),
  webOrigins: devOrigins,
  attributes: {
    'pkce.code.challenge.method': 'S256',
    'post.logout.redirect.uris': devOrigins.map((o) => `${o}/*`).join('##'),
  },
  protocolMappers: [
    {
      name: 'audience-api',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-audience-mapper',
      config: {
        'included.client.audience': 'api',
        'access.token.claim': 'true',
        'id.token.claim': 'false',
      },
    },
    {
      // Méthodes utilisées pendant la connexion (« pwd », « otp ») : l'API exige « otp »
      // pour la modération, quel que soit le chemin (connexion, mot de passe oublié…).
      name: 'methodes-authentification',
      protocol: 'openid-connect',
      protocolMapper: 'oidc-amr-mapper',
      config: {
        'access.token.claim': 'true',
        'id.token.claim': 'false',
        'lightweight.claim': 'false',
      },
    },
  ],
});

// 5. Connexion navigateur : MFA (TOTP) obligatoire pour la modération et l'administration.
const FLOW = 'navigateur-plumiotheca';
const flows = await kc.get(`${R}/authentication/flows`);
if (!flows.some((f) => f.alias === FLOW)) {
  await kc.post(`${R}/authentication/flows/browser/copy`, { newName: FLOW });
}
const enc = encodeURIComponent;
let execs = await kc.get(`${R}/authentication/flows/${enc(FLOW)}/executions`);
const forms = execs.find(
  (e) => e.level === 0 && e.authenticationFlow && /forms/i.test(e.displayName),
);
for (const role of ['moderation', 'administration']) {
  const alias = `OTP obligatoire ${role}`;
  if (!execs.some((e) => e.displayName === alias)) {
    await kc.post(`${R}/authentication/flows/${enc(forms.displayName)}/executions/flow`, {
      alias,
      type: 'basic-flow',
      description: `TOTP exigé pour le rôle ${role}`,
      provider: 'registration-page-form',
    });
    execs = await kc.get(`${R}/authentication/flows/${enc(FLOW)}/executions`);
    const sub = execs.find((e) => e.displayName === alias);
    await kc.put(`${R}/authentication/flows/${enc(FLOW)}/executions`, {
      ...sub,
      requirement: 'CONDITIONAL',
    });
    await kc.post(`${R}/authentication/flows/${enc(alias)}/executions/execution`, {
      provider: 'conditional-user-role',
    });
    // Saute l'étape si un code TOTP a déjà été saisi pendant cette connexion
    // (sinon un modérateur déjà équipé devrait saisir deux codes).
    await kc.post(`${R}/authentication/flows/${enc(alias)}/executions/execution`, {
      provider: 'conditional-credential',
    });
    await kc.post(`${R}/authentication/flows/${enc(alias)}/executions/execution`, {
      provider: 'auth-otp-form',
    });
    const inner = await kc.get(`${R}/authentication/flows/${enc(alias)}/executions`);
    for (const e of inner) {
      await kc.put(`${R}/authentication/flows/${enc(alias)}/executions`, {
        ...e,
        requirement: 'REQUIRED',
      });
    }
    const cond = inner.find((e) => e.providerId === 'conditional-user-role');
    await kc.post(`${R}/authentication/executions/${cond.id}/config`, {
      alias: `role-${role}`,
      config: { condUserRole: role, negate: 'false' },
    });
    const credCond = inner.find((e) => e.providerId === 'conditional-credential');
    await kc.post(`${R}/authentication/executions/${credCond.id}/config`, {
      alias: `otp-pas-encore-saisi-${role}`,
      config: { credentials: 'otp', included: 'false' },
    });
    execs = await kc.get(`${R}/authentication/flows/${enc(FLOW)}/executions`);
  }
}
// 5 bis. Valeurs AMR (RFC 8176) : chaque étape réussie s'inscrit dans le claim « amr »
//        du jeton. Seuls les formulaires de mot de passe et de code TOTP en ont une.
//        Durée de validité de chaque valeur : celle de la session (sans elle, Keycloak la
//        tient pour expirée dès la seconde suivante et « otp » disparaît des jetons).
const AMR = { 'auth-username-password-form': 'pwd', 'auth-otp-form': 'otp' };
const AMR_MAX_AGE = '36000'; // = ssoSessionMaxLifespan
execs = await kc.get(`${R}/authentication/flows/${enc(FLOW)}/executions`);
for (const [i, e] of execs.entries()) {
  const ref = AMR[e.providerId];
  if (ref && !e.authenticationConfig) {
    await kc.post(`${R}/authentication/executions/${e.id}/config`, {
      alias: `amr-${ref}-${i}`,
      config: { 'default.reference.value': ref, 'default.reference.maxAge': AMR_MAX_AGE },
    });
  }
}
await kc.put(R, { browserFlow: FLOW });

// 5 ter. « Mot de passe oublié » : jamais de réinitialisation du code TOTP par e-mail.
//        Sinon, qui contrôle la boîte mail d'une personne de l'équipe enregistre son propre
//        code. Une personne qui perd son appareil passe par l'administration (décision 35).
const RESET = 'reinitialisation-plumiotheca';
if (!(await kc.get(`${R}/authentication/flows`)).some((f) => f.alias === RESET)) {
  await kc.post(`${R}/authentication/flows/${enc('reset credentials')}/copy`, { newName: RESET });
}
for (const e of await kc.get(`${R}/authentication/flows/${enc(RESET)}/executions`)) {
  if (e.level === 0 && /Conditional OTP/i.test(e.displayName)) {
    await kc.put(`${R}/authentication/flows/${enc(RESET)}/executions`, {
      ...e,
      requirement: 'DISABLED',
    });
  }
}
//        Rôles d'équipe : « Mot de passe oublié » refusé, avant tout envoi d'e-mail (#125).
//        Sinon le lien reçu ouvre une session où une action d'application
//        (kc_action=CONFIGURE_TOTP) enregistre un second code : la boîte mail suffirait.
for (const role of ['moderation', 'administration']) {
  const alias = `Refus reinitialisation ${role}`;
  let execs = await kc.get(`${R}/authentication/flows/${enc(RESET)}/executions`);
  if (execs.some((e) => e.displayName === alias)) continue;
  await kc.post(`${R}/authentication/flows/${enc(RESET)}/executions/flow`, {
    alias,
    type: 'basic-flow',
    description: `Réinitialisation par l'administration pour le rôle ${role}`,
    provider: 'registration-page-form',
  });
  execs = await kc.get(`${R}/authentication/flows/${enc(RESET)}/executions`);
  const sub = execs.find((e) => e.displayName === alias);
  await kc.put(`${R}/authentication/flows/${enc(RESET)}/executions`, {
    ...sub,
    requirement: 'CONDITIONAL',
  });
  await kc.post(`${R}/authentication/flows/${enc(alias)}/executions/execution`, {
    provider: 'conditional-user-role',
  });
  await kc.post(`${R}/authentication/flows/${enc(alias)}/executions/execution`, {
    provider: 'deny-access-authenticator',
  });
  const inner = await kc.get(`${R}/authentication/flows/${enc(alias)}/executions`);
  for (const e of inner) {
    await kc.put(`${R}/authentication/flows/${enc(alias)}/executions`, {
      ...e,
      requirement: 'REQUIRED',
    });
  }
  const cond = inner.find((e) => e.providerId === 'conditional-user-role');
  await kc.post(`${R}/authentication/executions/${cond.id}/config`, {
    alias: `reinitialisation-role-${role}`,
    config: { condUserRole: role, negate: 'false' },
  });
  const deny = inner.find((e) => e.providerId === 'deny-access-authenticator');
  await kc.post(`${R}/authentication/executions/${deny.id}/config`, {
    alias: `reinitialisation-refus-${role}`,
    config: {
      denyErrorMessage:
        'Pour ce compte, la réinitialisation passe par l’administration de Plumiotheca.',
    },
  });
  // Juste après le choix du compte (la condition a besoin de lui), avant l'envoi de l'e-mail.
  for (;;) {
    const top = (await kc.get(`${R}/authentication/flows/${enc(RESET)}/executions`)).filter(
      (e) => e.level === 0,
    );
    const index = top.findIndex((e) => e.displayName === alias);
    const chooseUser = top.findIndex((e) => e.providerId === 'reset-credentials-choose-user');
    if (index <= chooseUser + 1) break;
    await kc.post(`${R}/authentication/executions/${top[index].id}/raise-priority`);
  }
}
await kc.put(R, { resetCredentialsFlow: RESET });

// 6. Fermer les accès qui contourneraient la MFA ou dureraient trop longtemps.
const clients = await kc.get(`${R}/clients`);
const byId = (clientId) => clients.find((c) => c.clientId === clientId);
//    admin-cli de ce realm : pas de mot de passe direct (l'administration passe par « master »).
await kc.put(`${R}/clients/${byId('admin-cli').id}`, {
  ...byId('admin-cli'),
  directAccessGrantsEnabled: false,
});
//    Pas de jeton hors ligne (quasi permanent) pour une application dans le navigateur.
const scopes = await kc.get(`${R}/client-scopes`);
const scopeId = (name) => scopes.find((sc) => sc.name === name).id;
const web = byId('web');
await kc.del(`${R}/clients/${web.id}/optional-client-scopes/${scopeId('offline_access')}`);
const defaultRoles = await kc.get(`${R}/roles/default-roles-${REALM}/composites/realm`);
const offline = defaultRoles.filter((r) => r.name === 'offline_access');
if (offline.length) {
  await kc.del(`${R}/roles/default-roles-${REALM}/composites`, offline);
}
//    L'e-mail ne circule pas dans chaque jeton d'accès (journaux sans données personnelles).
await kc.del(`${R}/clients/${web.id}/default-client-scopes/${scopeId('email')}`);
await kc.put(`${R}/clients/${web.id}/optional-client-scopes/${scopeId('email')}`);

// 7. Export (sans utilisateurs ni secrets) vers le fichier importé au démarrage.
const exported = await kc.post(`${R}/partial-export?exportClients=true&exportGroupsAndRoles=true`);
delete exported.id;
// L'export masque les valeurs de configuration (« ********** ») : on remet les valeurs AMR
// connues, et on retire les secrets de client pour que Keycloak en génère à l'import.
for (const cfg of exported.authenticatorConfig ?? []) {
  const ref = /^amr-(\w+)-\d+$/.exec(cfg.alias)?.[1];
  if (ref) {
    cfg.config['default.reference.value'] = ref;
    cfg.config['default.reference.maxAge'] = AMR_MAX_AGE;
  }
}
for (const client of exported.clients ?? []) delete client.secret;
const masked = JSON.stringify(exported).match(/"([^"]+)":"\*{10}"/);
if (masked) throw new Error(`Valeur masquée restante dans l'export : ${masked[1]}`);
// Ordre stable (Keycloak exporte dans un ordre variable) pour des diffs lisibles. Seules les
// listes dont l'ordre n'a pas de sens sont triées ; les étapes des flux gardent le leur.
const by = (key) => (a, b) => String(a[key]).localeCompare(String(b[key]));
const sortMappers = (o) => o.protocolMappers?.sort(by('name'));
exported.roles?.realm?.sort(by('name'));
for (const roles of Object.values(exported.roles?.client ?? {})) roles.sort(by('name'));
for (const role of [
  ...(exported.roles?.realm ?? []),
  ...Object.values(exported.roles?.client ?? {}).flat(),
]) {
  role.composites?.realm?.sort();
  for (const list of Object.values(role.composites?.client ?? {})) list.sort();
}
exported.clients?.sort(by('clientId'));
exported.clientScopes?.sort(by('name'));
exported.clients?.forEach(sortMappers);
exported.clientScopes?.forEach(sortMappers);
for (const client of exported.clients ?? []) {
  client.defaultClientScopes?.sort();
  client.optionalClientScopes?.sort();
}
for (const list of Object.values(exported.components ?? {})) {
  list.sort((a, b) => `${a.name}|${a.subType}`.localeCompare(`${b.name}|${b.subType}`));
  for (const c of list) for (const v of Object.values(c.config ?? {})) v.sort?.();
}
exported.defaultDefaultClientScopes?.sort();
exported.defaultOptionalClientScopes?.sort();
// Identifiants techniques régénérés à chaque création : Keycloak les recrée à l'import
// (les références passent par les noms et alias).
const stripIds = (value) => {
  if (Array.isArray(value)) return value.forEach(stripIds);
  if (value && typeof value === 'object') {
    delete value.id;
    delete value.containerId;
    delete value.parentId;
    delete value['client.secret.creation.time'];
    Object.values(value).forEach(stripIds);
  }
};
stripIds(exported);
// Clés des dictionnaires de réglages triées (Keycloak les exporte dans un ordre variable).
const sortConfigs = (value) => {
  if (Array.isArray(value)) return value.forEach(sortConfigs);
  if (!value || typeof value !== 'object') return;
  for (const key of ['config', 'attributes']) {
    if (value[key] && typeof value[key] === 'object' && !Array.isArray(value[key])) {
      value[key] = Object.fromEntries(
        Object.entries(value[key]).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
  }
  Object.values(value).forEach(sortConfigs);
};
sortConfigs(exported);
const out = join(root, 'infra', 'keycloak', 'realm-plumiotheca.json');
writeFileSync(out, JSON.stringify(exported, null, 2) + '\n');
console.log(`✓ Realm configuré et exporté dans ${out}`);
