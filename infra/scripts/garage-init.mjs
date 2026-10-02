// Initialise Garage (nœud unique) : disposition, bucket « medias » et clé d'accès
// pour l'API. Idempotent. Écrit les identifiants S3 dans apps/api/.env.
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
const KEY_NAME = 'plumiotheca-api-dev';

const status = garage('status');
if (/NO ROLE ASSIGNED/.test(status)) {
  const nodeId = status.match(/^([0-9a-f]{16})\s/m)?.[1];
  if (!nodeId) throw new Error(`Identifiant de nœud Garage introuvable :\n${status}`);
  garage('layout', 'assign', '-z', 'dev', '-c', '1G', nodeId);
  garage('layout', 'apply', '--version', '1');
  console.log('✓ Disposition Garage appliquée');
}

if (!garage('bucket', 'list').includes(BUCKET)) {
  garage('bucket', 'create', BUCKET);
  console.log(`✓ Bucket « ${BUCKET} » créé`);
}

let keyInfo;
if (garage('key', 'list').includes(KEY_NAME)) {
  keyInfo = garage('key', 'info', '--show-secret', KEY_NAME);
} else {
  keyInfo = garage('key', 'create', KEY_NAME);
  garage('bucket', 'allow', '--read', '--write', BUCKET, '--key', KEY_NAME);
  console.log(`✓ Clé « ${KEY_NAME} » créée avec accès à « ${BUCKET} »`);
}
const keyId = keyInfo.match(/Key ID:\s*(\S+)/)?.[1];
const keySecret = keyInfo.match(/Secret key:\s*(\S+)/)?.[1];
if (!keyId || !keySecret) throw new Error(`Clé Garage illisible :\n${keyInfo}`);

const apiEnv = join(root, 'apps', 'api', '.env');
const env = readFileSync(apiEnv, 'utf8')
  .replace(/^S3_ACCESS_KEY_ID=.*$/m, `S3_ACCESS_KEY_ID=${keyId}`)
  .replace(/^S3_SECRET_ACCESS_KEY=.*$/m, `S3_SECRET_ACCESS_KEY=${keySecret}`);
writeFileSync(apiEnv, env, { mode: 0o600 });
console.log('✓ Identifiants S3 écrits dans apps/api/.env');
