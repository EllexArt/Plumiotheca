import { type DynamicModule, Module, type Provider } from '@nestjs/common';
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import { CONFIG } from '../config/config.module.js';
import type { Config } from '../config/env.js';
import { JWKS, TokenVerifier } from './token-verifier.js';

/**
 * Clés de Keycloak, mises en cache une heure ; une clé inconnue (rotation) déclenche une
 * nouvelle lecture, au plus toutes les 30 s.
 */
const remoteJwks: Provider = {
  provide: JWKS,
  inject: [CONFIG],
  useFactory: (config: Config) =>
    createRemoteJWKSet(new URL(config.KEYCLOAK_JWKS_URL), {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 60 * 60_000,
    }),
};

@Module({})
export class AuthModule {
  /** @param jwks clés de vérification imposées (tests) ; celles de Keycloak sinon. */
  static forRoot(jwks?: JWTVerifyGetKey): DynamicModule {
    return {
      module: AuthModule,
      providers: [TokenVerifier, jwks ? { provide: JWKS, useValue: jwks } : remoteJwks],
      exports: [TokenVerifier],
    };
  }
}
