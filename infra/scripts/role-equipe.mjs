// Rôles d'équipe (modération, administration) dans le realm (#125). Voir docs/procedures.md.
//
//   node infra/scripts/role-equipe.mjs attribuer <identifiant> moderation
//        → affiche le code TOTP enregistré ; relancer avec --otp <id> une fois vérifié
//   node infra/scripts/role-equipe.mjs attribuer <identifiant> moderation --otp <id>
//   node infra/scripts/role-equipe.mjs retirer <identifiant> moderation
//   node infra/scripts/role-equipe.mjs verifier
//
// Keycloak visé : KEYCLOAK_URL (http://localhost:8080 par défaut), identifiants
// d'administration du realm « master » lus dans infra/.env.
//
// L'attribution exige exactement un code TOTP, vérifié avec la personne : sinon le code
// serait enregistré à la première connexion avec le rôle, ou un second code ajouté par un
// tiers passerait inaperçu.
import { adminClient, KC, REALM } from './keycloak-admin.mjs';

const ROLES = ['moderation', 'administration'];
const USAGE = `Usage :
  node infra/scripts/role-equipe.mjs attribuer <identifiant> ${ROLES.join('|')} [--otp <id>]
  node infra/scripts/role-equipe.mjs retirer <identifiant> ${ROLES.join('|')}
  node infra/scripts/role-equipe.mjs verifier`;

class Refus extends Error {}
const R = `/${REALM}`;
const date = (ms) =>
  ms ? new Date(ms).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : '?';

async function findUser(kc, username) {
  const [user] = await kc.get(`${R}/users?username=${encodeURIComponent(username)}&exact=true`);
  if (!user) throw new Refus(`Aucun compte « ${username} » dans le realm ${REALM}.`);
  return user;
}

const otpOf = async (kc, user) =>
  (await kc.get(`${R}/users/${user.id}/credentials`)).filter((c) => c.type === 'otp');

/** Rôles effectifs (directs, par groupe, par rôle composite). */
const effectiveRoles = async (kc, user) =>
  (await kc.get(`${R}/users/${user.id}/role-mappings/realm/composite`)).map((r) => r.name);

async function attribuer(kc, username, role, otpId) {
  const user = await findUser(kc, username);
  const name = user.username;
  if (!user.enabled) throw new Refus(`Le compte ${name} est désactivé.`);
  if (!user.emailVerified) throw new Refus(`L'adresse e-mail de ${name} n'est pas vérifiée.`);
  if (user.requiredActions?.length) {
    throw new Refus(
      `Actions en attente sur ${name} (${user.requiredActions.join(', ')}) : la personne doit ` +
        `d'abord se connecter et les terminer, pendant l'appel.`,
    );
  }
  const otp = await otpOf(kc, user);
  if (otp.length === 0) {
    throw new Refus(
      `${name} n'a pas encore de code TOTP : ajoutez l'action « Configure OTP » pendant l'appel ` +
        `et laissez la personne l'enregistrer (docs/procedures.md).`,
    );
  }
  if (otp.length > 1) {
    throw new Refus(
      `${name} a ${otp.length} codes TOTP ; il en faut exactement un, enregistré pendant ` +
        `l'appel. Supprimez-les tous (onglet « Credentials ») et reprenez la procédure.`,
    );
  }
  const [code] = otp;
  if (otpId !== code.id) {
    console.log(`Code TOTP de ${name} :`);
    console.log(`  identifiant  ${code.id}`);
    console.log(`  appareil     ${code.userLabel ?? '(sans nom)'}`);
    console.log(`  enregistré   ${date(code.createdDate)}`);
    console.log(
      `Vérifiez avec la personne que ce code vient de son appareil, enregistré pendant l'appel, puis :`,
    );
    console.log(`  node infra/scripts/role-equipe.mjs attribuer ${name} ${role} --otp ${code.id}`);
    process.exit(2);
  }
  const realmRole = await kc.get(`${R}/roles/${role}`);
  await kc.post(`${R}/users/${user.id}/role-mappings/realm`, [realmRole]);
  // Ferme les sessions : les prochains jetons porteront le rôle et la preuve du code.
  await kc.post(`${R}/users/${user.id}/logout`);
  console.log(`✓ Rôle ${role} attribué à ${name} (code ${code.id}) ; sessions fermées.`);
}

async function retirer(kc, username, role) {
  const user = await findUser(kc, username);
  const name = user.username;
  const before = await effectiveRoles(kc, user);
  const realmRole = await kc.get(`${R}/roles/${role}`);
  await kc.del(`${R}/users/${user.id}/role-mappings/realm`, [realmRole]);
  await kc.post(`${R}/users/${user.id}/logout`);
  if ((await effectiveRoles(kc, user)).includes(role)) {
    throw new Refus(
      `${name} a encore le rôle ${role} par un groupe ou un rôle composite : retirez-le à la ` +
        `source (node infra/scripts/role-equipe.mjs verifier). Sessions fermées.`,
    );
  }
  console.log(
    before.includes(role)
      ? `✓ Rôle ${role} retiré à ${name} ; sessions fermées (jetons déjà émis : 5 minutes au plus).`
      : `• ${name} n'avait pas le rôle ${role} ; sessions fermées quand même.`,
  );
}

/** Audit : rôles d'équipe portés seulement directement, chacun avec exactement un code. */
async function verifier(kc) {
  const problems = [];
  const roles = await kc.get(`${R}/roles?briefRepresentation=false`);
  for (const role of ROLES) {
    for (const group of await kc.get(`${R}/roles/${role}/groups`)) {
      problems.push(`le groupe « ${group.name} » donne le rôle ${role}`);
    }
    for (const r of roles.filter((x) => x.composite && x.name !== role)) {
      const parts = await kc.get(`${R}/roles-by-id/${r.id}/composites`);
      if (parts.some((p) => p.name === role)) {
        problems.push(`le rôle composite « ${r.name} » contient ${role}`);
      }
    }
    for (const user of await kc.get(`${R}/roles/${role}/users?max=1000`)) {
      const otp = await otpOf(kc, user);
      if (otp.length !== 1) {
        problems.push(`${user.username} (${role}) a ${otp.length} code(s) TOTP`);
      } else {
        console.log(`• ${user.username} : ${role}, code enregistré le ${date(otp[0].createdDate)}`);
      }
    }
  }
  if (problems.length) throw new Refus(`À corriger :\n  - ${problems.join('\n  - ')}`);
  console.log('✓ Rôles d’équipe conformes (directs, un code TOTP chacun).');
}

const [action, username, role, flag, otpId] = process.argv.slice(2);
try {
  const valid =
    (action === 'verifier' && !username) ||
    (action === 'retirer' && username && ROLES.includes(role) && !flag) ||
    (action === 'attribuer' && username && ROLES.includes(role) && (!flag || flag === '--otp'));
  if (!valid) throw new Refus(USAGE);
  const kc = await adminClient();
  if (action === 'verifier') await verifier(kc);
  else if (action === 'retirer') await retirer(kc, username, role);
  else await attribuer(kc, username, role, otpId);
} catch (error) {
  if (error instanceof Refus) console.error(`✗ ${error.message}`);
  else console.error(`✗ Erreur avec Keycloak (${KC}) : ${error.message}`);
  process.exit(1);
}
