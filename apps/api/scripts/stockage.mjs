// Règle le bucket privé des téléversements (#18) : CORS (le navigateur y envoie le fichier
// directement, en POST) et expiration des fichiers bruts après un jour. Idempotent.
// Lancé par infra/scripts/garage-init.mjs en développement ; en production, à lancer une
// fois avec les variables S3_* et CORS_ORIGINS de l'API :
//   node apps/api/scripts/stockage.mjs
import {
  PutBucketCorsCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Valeurs de apps/api/.env, sauf celles déjà fournies par l'environnement.
const envFile = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');
const fromFile = existsSync(envFile)
  ? Object.fromEntries(
      readFileSync(envFile, 'utf8')
        .split('\n')
        .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
        .filter(Boolean)
        .map((m) => [m[1], m[2].trim()]),
    )
  : {};
const env = (name, fallback) => process.env[name] || fromFile[name] || fallback;

const bucket = env('S3_INCOMING_BUCKET', 'medias-entrants');
const origins = env('CORS_ORIGINS', 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const client = new S3Client({
  endpoint: env('S3_ENDPOINT', 'http://localhost:3900'),
  region: env('S3_REGION', 'garage'),
  forcePathStyle: true,
  credentials: {
    accessKeyId: env('S3_ACCESS_KEY_ID'),
    secretAccessKey: env('S3_SECRET_ACCESS_KEY'),
  },
});

await client.send(
  new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: origins,
          AllowedMethods: ['POST'],
          AllowedHeaders: ['*'],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);
await client.send(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: bucket,
    LifecycleConfiguration: {
      Rules: [
        {
          ID: 'bruts-un-jour',
          Status: 'Enabled',
          Filter: { Prefix: '' },
          Expiration: { Days: 1 },
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
        },
      ],
    },
  }),
);
client.destroy();
console.log(`✓ Bucket « ${bucket} » : CORS (${origins.join(', ')}) et expiration à un jour`);
