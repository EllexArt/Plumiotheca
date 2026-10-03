import { randomUUID } from 'node:crypto';
import { CHARTER_VERSION } from '@plumiotheca/contracts';
import { DataSource } from 'typeorm';
import { Module, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Problem } from '@plumiotheca/contracts';
import {
  type JWTVerifyGetKey,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type JWTPayload,
  SignJWT,
  type CryptoKey,
} from 'jose';
import request from 'supertest';
import { afterEach, beforeEach, expect } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { loadConfig } from '../src/config/env.js';
import { configureApp } from '../src/setup.js';
import { User } from '../src/users/user.entity.js';
import { testDbEnv } from './db-env.js';

export const ISSUER = 'http://localhost:8080/realms/plumiotheca';

// Paire de clés de test : remplace les clés publiques de Keycloak dans l'application.
const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
const jwk = { ...(await exportJWK(publicKey)), kid: 'cle-de-test', alg: 'RS256', use: 'sig' };
const jwks = createLocalJWKSet({ keys: [jwk] });

/** Une autre paire, inconnue de l'application (signature invalide). */
export const foreignKey = (await generateKeyPair('RS256')).privateKey;

/** Jeton d'accès comme Keycloak en émet pour le client « web », modifiable champ par champ. */
export async function token(
  claims: JWTPayload & Record<string, unknown> = {},
  { key = privateKey, kid = 'cle-de-test' }: { key?: CryptoKey; kid?: string } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: ISSUER,
    aud: ['api', 'account'],
    azp: 'web',
    typ: 'Bearer',
    sub: randomUUID(),
    iat: now,
    exp: now + 300,
    realm_access: { roles: ['default-roles-plumiotheca'] },
    amr: ['pwd'],
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid })
    .sign(key);
}

// nestjs-pino crée un seul journal par processus : une seule sortie par fichier de test.
const lines: string[] = [];
const logDestination = { write: (line: string) => void lines.push(line) };

let app: NestExpressApplication | undefined;
beforeEach(() => {
  lines.length = 0;
});
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** Démarre l'application complète (avec des routes d'essai propres au test). */
export async function start(
  env: Record<string, string> = {},
  controllers: Type[] = [],
  keys: JWTVerifyGetKey = jwks,
) {
  const config = loadConfig({ ...testDbEnv(), NODE_ENV: 'test', LOG_LEVEL: 'info', ...env });

  @Module({ imports: [AppModule.forRoot(config, { logDestination, jwks: keys })], controllers })
  class TestModule {}

  app = await NestFactory.create<NestExpressApplication>(TestModule, {
    bodyParser: false,
    logger: false,
    abortOnError: false,
  });
  configureApp(app, config);
  await app.init();
  return { app, http: request(app.getHttpServer()), logs: () => lines.join('') };
}

export const expectProblem = (body: unknown, status: number) => {
  const problem = Problem.parse(body);
  expect(problem.status).toBe(status);
  return problem;
};

/**
 * Jeton d'une personne dont le compte est prêt (première visite faite, charte acceptée) :
 * pour tester les routes ordinaires sans refaire le parcours d'arrivée.
 */
export async function readyToken(
  app: NestExpressApplication,
  claims: JWTPayload & Record<string, unknown> = {},
) {
  const sub = claims.sub ?? randomUUID();
  const handle = `essai-${sub.slice(0, 8)}`;
  await app.get(DataSource).getRepository(User).insert({
    keycloakId: sub,
    handle,
    handleKey: handle,
    ageBand: '18+',
    charterVersion: CHARTER_VERSION,
    charterAcceptedAt: new Date(),
  });
  return token({ ...claims, sub });
}
