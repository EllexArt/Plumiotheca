// Vérifie le realm importé de bout en bout, comme le ferait un navigateur :
// émetteur, connexion par code d'autorisation + PKCE, audience du jeton,
// refus du mot de passe direct, MFA exigée pour la modération et preuve de MFA
// (claim « amr ») vérifiée par l'API.
// Usage : node infra/scripts/check-realm.mjs (infrastructure démarrée).
// Avec l'API lancée sur le port 3000, ses réponses sont vérifiées aussi ;
// API_REQUIRED=1 rend ces vérifications obligatoires (CI).
import { createHash, randomBytes } from 'node:crypto';
import { adminClient, KC, REALM } from './keycloak-admin.mjs';
import {
  browser,
  decode,
  exchange,
  follow,
  formAction,
  ISSUER,
  login,
  REDIRECT,
} from './oidc-test.mjs';

const API = process.env.API_URL ?? 'http://localhost:3000';
const API_REQUIRED = process.env.API_REQUIRED === '1';
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures++;
};

/** Session vue par l'API (GET /api/moi), ou null si l'API n'est pas lancée. */
async function apiSession(accessToken) {
  const res = await fetch(`${API}/api/moi`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }).catch(() => null);
  if (!res) {
    if (API_REQUIRED) check(false, `API joignable sur ${API}`);
    return null;
  }
  return { status: res.status, body: res.ok ? await res.json() : null };
}

async function mailTo(address) {
  for (let i = 0; i < 20; i++) {
    const box = await (
      await fetch(
        `http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`,
      )
    ).json();
    const mail = box.messages?.[0];
    if (mail) return (await fetch(`http://localhost:8025/api/v1/message/${mail.ID}`)).json();
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

/** Parcours « mot de passe oublié » complet dans un navigateur, jusqu'au retour à l'application. */
async function forgotPassword(username, email) {
  const nav = browser();
  const verifier = randomBytes(32).toString('base64url');
  const auth = new URL(`${ISSUER}/protocol/openid-connect/auth`);
  auth.search = new URLSearchParams({
    client_id: 'web',
    response_type: 'code',
    scope: 'openid',
    redirect_uri: REDIRECT,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    state: randomBytes(8).toString('hex'),
  });
  const page = await (await nav(auth)).text();
  const resetLink = page
    .match(/href="([^"]*reset-credentials[^"]*)"/)?.[1]
    ?.replaceAll('&amp;', '&');
  const resetPage = await (await nav(new URL(resetLink, ISSUER))).text();
  await nav(formAction(resetPage, 'kc-reset-password-form'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username }),
  });
  const mail = await mailTo(email);
  const link = mail?.Text.match(/https?:\/\/\S+action-token\S+/)?.[0];
  const { current } = await follow(nav, await nav(link));
  const update = formAction(await current.text(), 'kc-passwd-update-form');
  const fresh = `Nouveau-${randomBytes(9).toString('base64url')}`;
  const { location } = await follow(
    nav,
    await nav(update, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'password-new': fresh, 'password-confirm': fresh }),
    }),
  );
  return location?.startsWith(REDIRECT) ? exchange(location, verifier) : {};
}

const kc = await adminClient();
const R = `/${REALM}`;
const password = `Essai-${randomBytes(9).toString('base64url')}`;
const created = [];
async function createUser(username, roles = [], otpSecret) {
  const credentials = [{ type: 'password', value: password, temporary: false }];
  if (otpSecret) {
    credentials.push({
      type: 'otp',
      userLabel: 'vérification',
      secretData: JSON.stringify({ value: otpSecret }),
      credentialData: JSON.stringify({
        subType: 'totp',
        digits: 6,
        counter: 0,
        period: 30,
        algorithm: 'HmacSHA1',
      }),
    });
  }
  await kc.post(`${R}/users`, {
    username,
    email: `${username}@exemple.localhost`,
    emailVerified: true,
    enabled: true,
    credentials,
  });
  const [user] = await kc.get(`${R}/users?username=${username}&exact=true`);
  created.push(user.id);
  for (const name of roles) {
    const role = await kc.get(`${R}/roles/${name}`);
    await kc.post(`${R}/users/${user.id}/role-mappings/realm`, [role]);
  }
  return user;
}

try {
  const disco = await (await fetch(`${ISSUER}/.well-known/openid-configuration`)).json();
  check(
    disco.issuer === ISSUER,
    `Émetteur identique pour le navigateur et l'API (${disco.issuer})`,
  );

  const suffix = randomBytes(4).toString('hex');
  await createUser(`lectrice-${suffix}`);
  const { tokens } = await login(`lectrice-${suffix}`, password);
  check(Boolean(tokens?.access_token), 'Connexion navigateur (code + PKCE) réussie');
  if (tokens?.access_token) {
    const at = decode(tokens.access_token);
    const aud = [at.aud].flat();
    check(at.iss === ISSUER, 'Jeton émis par le bon émetteur');
    check(aud.includes('api'), "Jeton destiné à l'API (audience « api »)");
    check(at.azp === 'web', 'Jeton émis pour le client « web »');
    check(
      at.preferred_username === `lectrice-${suffix}`,
      "Le nom d'utilisateur n'est pas l'e-mail",
    );
    check(at.email === undefined, "Pas d'e-mail dans le jeton d'accès");
    check(
      JSON.stringify(at.amr) === '["pwd"]',
      `Mot de passe seul : « amr » = ${JSON.stringify(at.amr)}`,
    );
    const session = await apiSession(tokens.access_token);
    if (session) {
      check(
        session.status === 200 && session.body?.mfa === false,
        `L'API accepte le jeton du navigateur (statut ${session.status}, sans MFA)`,
      );
    } else {
      console.log("• API non démarrée : acceptation du jeton par l'API non vérifiée");
    }
  }

  const direct = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'web',
      username: `lectrice-${suffix}`,
      password,
    }),
  });
  check(direct.status >= 400, 'Connexion par mot de passe direct refusée pour le client « web »');

  // Nom d'utilisateur contenant une adresse e-mail : refusé par le profil.
  let refused = false;
  try {
    await kc.post(`${R}/users`, {
      username: `pseudo.${suffix}@exemple.localhost`,
      email: `x-${suffix}@exemple.localhost`,
      enabled: true,
    });
    const [u] = await kc.get(
      `${R}/users?username=${encodeURIComponent(`pseudo.${suffix}@exemple.localhost`)}&exact=true`,
    );
    if (u) created.push(u.id);
  } catch {
    refused = true;
  }
  check(refused, "Nom d'utilisateur contenant une adresse e-mail refusé");

  // Pas de jeton hors ligne (quasi permanent) pour le client « web ».
  const off = await login(`lectrice-${suffix}`, password, { scope: 'openid offline_access' });
  const refresh = off.tokens?.refresh_token ? decode(off.tokens.refresh_token) : null;
  check(!refresh || refresh.typ !== 'Offline', 'Aucun jeton hors ligne délivré au client « web »');

  // Modération déjà équipée de TOTP : un seul code demandé, connexion réussie.
  const secret = randomBytes(15).toString('hex');
  await createUser(`moderateur-equipe-${suffix}`, ['moderation'], secret);
  const equipped = await login(`moderateur-equipe-${suffix}`, password, { otpSecret: secret });
  check(
    Boolean(equipped.tokens?.access_token) && equipped.otpPrompts === 1,
    `Modération équipée : un seul code TOTP demandé (${equipped.otpPrompts ?? 0})`,
  );
  if (equipped.tokens?.access_token) {
    const amr = decode(equipped.tokens.access_token).amr ?? [];
    check(amr.includes('otp'), `Modération : preuve du code TOTP dans « amr » (${amr})`);
    const session = await apiSession(equipped.tokens.access_token);
    if (session) {
      check(
        session.body?.mfa === true && session.body.roles.includes('moderation'),
        "L'API reconnaît la modération avec double authentification",
      );
    }
  }

  // admin-cli du realm : pas de mot de passe direct (contournement de la MFA).
  const cli = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: `moderateur-equipe-${suffix}`,
      password,
    }),
  });
  check(cli.status >= 400, 'Mot de passe direct refusé aussi pour admin-cli dans ce realm');

  await createUser(`moderatrice-${suffix}`, ['moderation']);
  const mod = await login(`moderatrice-${suffix}`, password);
  check(
    !mod.tokens && /totp|otp/i.test(mod.page ?? ''),
    'Modération : configuration de la double authentification exigée',
  );

  // « Mot de passe oublié » : Keycloak ouvre une session sans passer par le code TOTP.
  // Le jeton ne doit alors porter aucune preuve de MFA, et l'API la refuser (#120).
  await createUser(`moderatrice-oubli-${suffix}`, ['moderation']);
  const forgot = await forgotPassword(
    `moderatrice-oubli-${suffix}`,
    `moderatrice-oubli-${suffix}@exemple.localhost`,
  );
  if (forgot.tokens?.access_token) {
    const amr = decode(forgot.tokens.access_token).amr ?? [];
    check(!amr.includes('otp'), `Mot de passe oublié : aucune preuve de MFA (« amr » = [${amr}])`);
    const session = await apiSession(forgot.tokens.access_token);
    if (session) {
      check(session.body?.mfa === false, "Mot de passe oublié : l'API ne voit pas de MFA");
    }
  } else {
    // Si Keycloak bloque un jour ce parcours, c'est mieux : adapter alors cette vérification.
    check(false, 'Mot de passe oublié : parcours non abouti (à examiner)');
  }

  // E-mails : Keycloak envoie via Mailpit (vérification d'adresse, mot de passe oublié).
  const [lectrice] = await kc.get(`${R}/users?username=lectrice-${suffix}&exact=true`);
  await kc.put(
    `${R}/users/${lectrice.id}/execute-actions-email?client_id=web&redirect_uri=${encodeURIComponent(REDIRECT)}`,
    ['UPDATE_PASSWORD'],
  );
  const mail = await mailTo(`lectrice-${suffix}@exemple.localhost`);
  check(Boolean(mail), 'E-mail envoyé par Keycloak et reçu dans Mailpit');

  const weak = await fetch(`${KC}/admin/realms${R}/users`, { method: 'HEAD' });
  check(weak.status === 401, "API d'administration inaccessible sans jeton");
} finally {
  for (const id of created) await kc.del(`${R}/users/${id}`);
}

if (failures) {
  console.error(`\n${failures} vérification(s) en échec`);
  process.exit(1);
}
console.log('\nRealm conforme');
