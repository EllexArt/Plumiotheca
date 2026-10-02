// Vérifie le realm importé de bout en bout, comme le ferait un navigateur :
// émetteur, connexion par code d'autorisation + PKCE, audience du jeton,
// refus du mot de passe direct, et MFA exigée pour la modération.
// Usage : node infra/scripts/check-realm.mjs (infrastructure démarrée).
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { adminClient, KC, REALM } from './keycloak-admin.mjs';

const ISSUER = `${KC}/realms/${REALM}`;
const REDIRECT = 'http://localhost:5173/callback';
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) failures++;
};

// Navigation minimale avec cookies, sans suivre les redirections automatiquement.
function browser() {
  const jar = new Map();
  return async (url, init = {}) => {
    const res = await fetch(url, {
      ...init,
      redirect: 'manual',
      headers: {
        ...(init.headers ?? {}),
        Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
      },
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      jar.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  };
}

// Code TOTP (RFC 6238) calculé comme Keycloak : clé = octets UTF-8 du secret.
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', Buffer.from(secret, 'utf8')).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

const formAction = (html, id) =>
  html
    .match(new RegExp(`<form[^>]*id="${id}"[^>]*action="([^"]+)"`))?.[1]
    ?.replaceAll('&amp;', '&');

async function login(username, password, { otpSecret, scope = 'openid' } = {}) {
  const nav = browser();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const auth = new URL(`${ISSUER}/protocol/openid-connect/auth`);
  auth.search = new URLSearchParams({
    client_id: 'web',
    response_type: 'code',
    scope,
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: randomBytes(8).toString('hex'),
  });
  const first = await nav(auth);
  const early = first.headers.get('location');
  // Demande refusée d'emblée (ex. scope non autorisé) : retour direct avec une erreur.
  if (early?.startsWith(REDIRECT)) return { error: new URL(early).searchParams.get('error') };
  const page = await first.text();
  const action = page
    .match(/<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"/)?.[1]
    ?.replaceAll('&amp;', '&');
  if (!action) throw new Error('Formulaire de connexion introuvable');
  const res = await nav(action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password }),
  });
  let current = res;
  let location = current.headers.get('location');
  let otpPrompts = 0;
  // Formulaire de code TOTP : rempli autant de fois qu'il est demandé (on en attend un seul).
  while (otpSecret && !location && otpPrompts < 3) {
    const html = await current.text();
    const otpAction = formAction(html, 'kc-otp-login-form');
    if (!otpAction) return { page: html, otpPrompts };
    otpPrompts++;
    current = await nav(otpAction, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ otp: totp(otpSecret) }),
    });
    location = current.headers.get('location');
  }
  // Suit les étapes intermédiaires (actions requises) jusqu'au retour vers l'application.
  for (let i = 0; i < 5 && location && !location.startsWith(REDIRECT); i++) {
    current = await nav(new URL(location, ISSUER));
    location = current.headers.get('location');
  }
  if (!location?.startsWith(REDIRECT)) return { page: await current.text(), otpPrompts };
  const code = new URL(location).searchParams.get('code');
  const tokenRes = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'web',
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    }),
  });
  return { tokens: await tokenRes.json(), otpPrompts };
}

const decode = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

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
    // Si l'API tourne en local, elle doit accepter ce jeton.
    const api = await fetch('http://localhost:3000/api/users/profile', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }).catch(() => null);
    if (api) check(api.status === 200, `L'API accepte le jeton (statut ${api.status})`);
    else console.log("• API non démarrée : vérification de l'acceptation du jeton ignorée");
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

  // E-mails : Keycloak envoie via Mailpit (vérification d'adresse, mot de passe oublié).
  const [lectrice] = await kc.get(`${R}/users?username=lectrice-${suffix}&exact=true`);
  await kc.put(
    `${R}/users/${lectrice.id}/execute-actions-email?client_id=web&redirect_uri=${encodeURIComponent(REDIRECT)}`,
    ['UPDATE_PASSWORD'],
  );
  let mail;
  for (let i = 0; i < 20 && !mail; i++) {
    const box = await (
      await fetch(
        `http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:lectrice-${suffix}@exemple.localhost`)}`,
      )
    ).json();
    mail = box.messages?.[0];
    if (!mail) await new Promise((r) => setTimeout(r, 500));
  }
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
