// Connexion « comme un navigateur » au realm de développement, pour les vérifications
// de bout en bout (check-realm.mjs, tests de l'API contre le vrai Keycloak).
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { KC, REALM } from './keycloak-admin.mjs';

export const ISSUER = `${KC}/realms/${REALM}`;
export const REDIRECT = 'http://localhost:5173/callback';

// Navigation minimale avec cookies, sans suivre les redirections automatiquement.
export function browser() {
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
export function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', Buffer.from(secret, 'utf8')).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

export const formAction = (html, id) =>
  html
    .match(new RegExp(`<form[^>]*id="${id}"[^>]*action="([^"]+)"`))?.[1]
    ?.replaceAll('&amp;', '&');

/** Démarre une demande d'autorisation (code + PKCE) et renvoie la première réponse. */
async function authorize(nav, scope) {
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
  return { verifier, first: await nav(auth) };
}

/** Échange le code reçu au retour vers l'application contre les jetons. */
export async function exchange(location, verifier) {
  const params = new URL(location).searchParams;
  if (!params.get('code')) return { error: params.get('error') };
  const tokenRes = await fetch(`${ISSUER}/protocol/openid-connect/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: 'web',
      code: params.get('code'),
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    }),
  });
  return { tokens: await tokenRes.json() };
}

/** Suit les redirections intermédiaires (actions requises) jusqu'au retour vers l'application. */
export async function follow(nav, current) {
  let location = current.headers.get('location');
  for (let i = 0; i < 5 && location && !location.startsWith(REDIRECT); i++) {
    current = await nav(new URL(location, ISSUER));
    location = current.headers.get('location');
  }
  return { current, location };
}

/**
 * Connexion complète par le formulaire. `nav` permet de garder les cookies d'un même
 * navigateur (session unique : reconnexion sans formulaire ensuite).
 */
export async function login(
  username,
  password,
  { otpSecret, scope = 'openid', nav = browser() } = {},
) {
  const { verifier, first } = await authorize(nav, scope);
  const early = first.headers.get('location');
  // Demande refusée d'emblée (ex. scope non autorisé) : retour direct avec une erreur.
  if (early?.startsWith(REDIRECT)) return exchange(early, verifier);
  const page = await first.text();
  const action = formAction(page, 'kc-form-login');
  if (!action) throw new Error('Formulaire de connexion introuvable');
  let current = await nav(action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username, password }),
  });
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
  ({ current, location } = await follow(nav, current));
  if (!location?.startsWith(REDIRECT)) return { page: await current.text(), otpPrompts };
  return { ...(await exchange(location, verifier)), otpPrompts };
}

/** Reconnexion dans un navigateur qui a déjà une session (aucun formulaire attendu). */
export async function ssoLogin(nav) {
  const { verifier, first } = await authorize(nav, 'openid');
  const { location } = await follow(nav, first);
  return location?.startsWith(REDIRECT) ? exchange(location, verifier) : {};
}

export const decode = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
