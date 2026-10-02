// Vérifie le realm importé de bout en bout, comme le ferait un navigateur :
// émetteur, connexion par code d'autorisation + PKCE, audience du jeton,
// refus du mot de passe direct, et MFA exigée pour la modération.
// Usage : node infra/scripts/check-realm.mjs (infrastructure démarrée).
import { createHash, randomBytes } from 'node:crypto';
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

async function login(username, password) {
  const nav = browser();
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const auth = new URL(`${ISSUER}/protocol/openid-connect/auth`);
  auth.search = new URLSearchParams({
    client_id: 'web',
    response_type: 'code',
    scope: 'openid',
    redirect_uri: REDIRECT,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: randomBytes(8).toString('hex'),
  });
  const page = await (await nav(auth)).text();
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
  // Suit les étapes intermédiaires (actions requises) jusqu'au retour vers l'application.
  for (let i = 0; i < 5 && location && !location.startsWith(REDIRECT); i++) {
    current = await nav(new URL(location, ISSUER));
    location = current.headers.get('location');
  }
  if (!location?.startsWith(REDIRECT)) return { page: await current.text() };
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
  return { tokens: await tokenRes.json() };
}

const decode = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());

const kc = await adminClient();
const R = `/${REALM}`;
const password = `Essai-${randomBytes(9).toString('base64url')}`;
const created = [];
async function createUser(username, roles = []) {
  await kc.post(`${R}/users`, {
    username,
    email: `${username}@exemple.localhost`,
    emailVerified: true,
    enabled: true,
    credentials: [{ type: 'password', value: password, temporary: false }],
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
