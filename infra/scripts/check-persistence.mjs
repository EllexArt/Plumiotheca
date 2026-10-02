// Vérifie que les comptes Keycloak survivent à un redémarrage de l'infrastructure.
// Usage : node check-persistence.mjs ecrire  →  docker compose down/up  →  node check-persistence.mjs lire
import { adminClient, REALM } from './keycloak-admin.mjs';

const kc = await adminClient();
const R = `/${REALM}`;
const USERNAME = 'persistance-verification';

if (process.argv[2] === 'ecrire') {
  await kc.post(`${R}/users`, {
    username: USERNAME,
    email: `${USERNAME}@exemple.localhost`,
    enabled: true,
  });
  console.log('✓ Compte de vérification créé');
} else {
  const [user] = await kc.get(`${R}/users?username=${USERNAME}&exact=true`);
  if (!user) {
    console.error('✗ Le compte a disparu après le redémarrage');
    process.exit(1);
  }
  await kc.del(`${R}/users/${user.id}`);
  console.log('✓ Le compte a survécu au redémarrage (supprimé ensuite)');
}
