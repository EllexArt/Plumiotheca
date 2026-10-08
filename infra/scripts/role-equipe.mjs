// Attribue ou retire un rôle d'équipe (modération, administration) dans le realm (#125).
//
//   node infra/scripts/role-equipe.mjs attribuer <identifiant> moderation
//   node infra/scripts/role-equipe.mjs retirer <identifiant> moderation
//
// L'attribution est refusée tant que le compte n'a pas de code TOTP enregistré : sinon le
// code serait enregistré à la première connexion avec le rôle, et quiconque contrôle la
// boîte mail à ce moment-là pourrait enregistrer le sien (voir docs/procedures.md).
import { adminClient, REALM } from './keycloak-admin.mjs';

const ROLES = ['moderation', 'administration'];
const [action, username, role] = process.argv.slice(2);

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!['attribuer', 'retirer'].includes(action) || !username || !ROLES.includes(role)) {
  fail(
    `Usage : node infra/scripts/role-equipe.mjs attribuer|retirer <identifiant> ${ROLES.join('|')}`,
  );
}

const kc = await adminClient();
const R = `/${REALM}`;
const [user] = await kc.get(`${R}/users?username=${encodeURIComponent(username)}&exact=true`);
if (!user) fail(`Aucun compte « ${username} » dans le realm ${REALM}.`);
const realmRole = await kc.get(`${R}/roles/${role}`);

if (action === 'retirer') {
  await kc.del(`${R}/users/${user.id}/role-mappings/realm`, [realmRole]);
  // Les sessions ouvertes gardent leurs jetons jusqu'à expiration : on les ferme.
  await kc.post(`${R}/users/${user.id}/logout`);
  console.log(`✓ Rôle ${role} retiré à ${username} ; sessions fermées.`);
  process.exit(0);
}

if (!user.enabled) fail(`Le compte ${username} est désactivé.`);
if (!user.emailVerified) fail(`L'adresse e-mail de ${username} n'est pas vérifiée.`);
const credentials = await kc.get(`${R}/users/${user.id}/credentials`);
if (!credentials.some((c) => c.type === 'otp')) {
  fail(
    `${username} n'a pas encore de code TOTP. Ajoutez l'action « Configure OTP » au compte, ` +
      `laissez la personne l'enregistrer et vérifiez-le avec elle, puis relancez (docs/procedures.md).`,
  );
}
await kc.post(`${R}/users/${user.id}/role-mappings/realm`, [realmRole]);
// Une session ouverte avant l'attribution n'a pas « otp » dans ses jetons : l'API la
// refuserait pour ce rôle. On la ferme pour que la personne se reconnecte avec son code.
await kc.post(`${R}/users/${user.id}/logout`);
console.log(`✓ Rôle ${role} attribué à ${username} (TOTP enregistré) ; sessions fermées.`);
