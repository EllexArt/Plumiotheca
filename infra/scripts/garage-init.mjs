// Initialise Garage (nœud unique) : disposition, buckets « medias » (public, servi par le
// site web de Garage) et « medias-entrants » (privé, téléversements bruts), clé d'accès
// de l'API. Idempotent. Écrit les identifiants S3 dans apps/api/.env, puis règle CORS et
// expiration du bucket privé (apps/api/scripts/stockage.mjs).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const compose = [
  'compose',
  '-f',
  join(root, 'infra', 'docker-compose.yml'),
  '--env-file',
  join(root, 'infra', '.env'),
];
const garage = (...args) =>
  execFileSync(
    'docker',
    [...compose, 'exec', '-T', '-e', 'RUST_LOG=warn', 'garage', '/garage', ...args],
    { encoding: 'utf8' },
  );

const BUCKET = 'medias';
const INCOMING = 'medias-entrants';
const KEY_NAME = 'plumiotheca-api-dev';

const status = garage('status');
if (/NO ROLE ASSIGNED/.test(status)) {
  const nodeId = status.match(/^([0-9a-f]{16})\s/m)?.[1];
  if (!nodeId) throw new Error(`Identifiant de nœud Garage introuvable :\n${status}`);
  garage('layout', 'assign', '-z', 'dev', '-c', '1G', nodeId);
  const current = Number(
    garage('layout', 'show').match(/Current cluster layout version:\s*(\d+)/)?.[1] ?? 0,
  );
  garage('layout', 'apply', '--version', String(current + 1));
  console.log('✓ Disposition Garage appliquée');
}

// Noms comparés exactement (colonne d'alias ou de nom), jamais par sous-chaîne.
const columns = (text) =>
  text
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s{2,}/));
const buckets = columns(garage('bucket', 'list'));
for (const name of [BUCKET, INCOMING]) {
  if (buckets.some((cols) => cols[2] === name)) continue;
  garage('bucket', 'create', name);
  console.log(`✓ Bucket « ${name} » créé`);
}
// Images traitées : lisibles par tout le monde sur le domaine des médias (port 3902).
garage('bucket', 'website', '--allow', BUCKET);

let keyInfo;
const keyExists = columns(garage('key', 'list')).some((cols) => cols[2] === KEY_NAME);
if (keyExists) {
  keyInfo = garage('key', 'info', '--show-secret', KEY_NAME);
} else {
  keyInfo = garage('key', 'create', KEY_NAME);
  console.log(`✓ Clé « ${KEY_NAME} » créée`);
}
garage('bucket', 'allow', '--read', '--write', BUCKET, '--key', KEY_NAME);
// « owner » : la clé règle elle-même CORS et expiration du bucket privé.
garage('bucket', 'allow', '--read', '--write', '--owner', INCOMING, '--key', KEY_NAME);
const keyId = keyInfo.match(/Key ID:\s*(\S+)/)?.[1];
const keySecret = keyInfo.match(/Secret key:\s*(\S+)/)?.[1];
if (!keyId || !keySecret) throw new Error(`Clé Garage illisible :\n${keyInfo}`);

const apiEnv = join(root, 'apps', 'api', '.env');
const env = readFileSync(apiEnv, 'utf8')
  .replace(/^S3_ACCESS_KEY_ID=.*$/m, `S3_ACCESS_KEY_ID=${keyId}`)
  .replace(/^S3_SECRET_ACCESS_KEY=.*$/m, `S3_SECRET_ACCESS_KEY=${keySecret}`);
writeFileSync(apiEnv, env, { mode: 0o600 });
console.log('✓ Identifiants S3 écrits dans apps/api/.env');

execFileSync(process.execPath, [join(root, 'apps', 'api', 'scripts', 'stockage.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, S3_ACCESS_KEY_ID: keyId, S3_SECRET_ACCESS_KEY: keySecret },
});
