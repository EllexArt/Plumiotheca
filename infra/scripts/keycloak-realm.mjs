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
const devOrigins = [
  'http://localhost:5000',
  'http://localhost:5001',
  'http://localhost:5002',
  'http://localhost:5173',
];
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
    execs = await kc.get(`${R}/authentication/flows/${enc(FLOW)}/executions`);
  }
}
await kc.put(R, { browserFlow: FLOW });

// 6. Export (sans utilisateurs ni secrets) vers le fichier importé au démarrage.
const exported = await kc.post(`${R}/partial-export?exportClients=true&exportGroupsAndRoles=true`);
delete exported.id;
const out = join(root, 'infra', 'keycloak', 'realm-plumiotheca.json');
writeFileSync(out, JSON.stringify(exported, null, 2) + '\n');
console.log(`✓ Realm configuré et exporté dans ${out}`);
