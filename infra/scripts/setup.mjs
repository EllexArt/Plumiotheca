// Prépare l'environnement de développement : infra/.env et apps/api/.env
// avec des secrets aléatoires. Idempotent : ne réécrit jamais un fichier existant.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const infraEnv = join(root, 'infra', '.env');
const apiEnv = join(root, 'apps', 'api', '.env');

const secret = () => randomBytes(24).toString('base64url');

export function parseEnv(text) {
  return Object.fromEntries(
    text
      .split('\n')
      .filter((l) => l.trim() && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}

if (!existsSync(infraEnv)) {
  const tpl = readFileSync(join(root, 'infra', '.env.example'), 'utf8');
  const filled = tpl
    .replaceAll('<généré-hex>', () => randomBytes(32).toString('hex'))
    .replaceAll('<généré>', secret);
  writeFileSync(infraEnv, filled, { mode: 0o600 });
  console.log('✓ infra/.env créé avec des secrets aléatoires');
} else {
  console.log('• infra/.env existe déjà, conservé');
}

if (!existsSync(apiEnv)) {
  const infra = parseEnv(readFileSync(infraEnv, 'utf8'));
  const tpl = readFileSync(join(root, 'apps', 'api', '.env.example'), 'utf8');
  const filled = tpl
    .replace('DB_USERNAME=plumiotheca', `DB_USERNAME=${infra.POSTGRES_USER}`)
    .replace('DB_PASSWORD=<infra>', `DB_PASSWORD=${infra.POSTGRES_PASSWORD}`)
    .replace('DB_NAME=plumiotheca', `DB_NAME=${infra.POSTGRES_DB}`)
    .replace('MEILI_MASTER_KEY=<infra>', `MEILI_MASTER_KEY=${infra.MEILI_MASTER_KEY}`);
  writeFileSync(apiEnv, filled, { mode: 0o600 });
  console.log('✓ apps/api/.env créé (les clés S3 seront ajoutées par « pnpm infra:up »)');
} else {
  console.log('• apps/api/.env existe déjà, conservé');
}
