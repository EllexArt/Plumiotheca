import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Role } from '@plumiotheca/contracts';
import { errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { ApiProblem } from '../common/problem.js';
import { CONFIG } from '../config/config.module.js';
import type { Config } from '../config/env.js';
import type { AuthUser } from './auth-user.js';

/** Clés publiques de Keycloak (JWKS), remplaçables dans les tests. */
export const JWKS = Symbol('JWKS');

/** Méthodes d'authentification (RFC 8176) qui valent second facteur. */
const SECOND_FACTORS = ['otp'];

const WWW_AUTHENTICATE = 'Bearer realm="plumiotheca", error="invalid_token"';

export const invalidToken = () =>
  new ApiProblem(
    HttpStatus.UNAUTHORIZED,
    'Votre session n’est pas valide. Reconnectez-vous.',
    'jeton-invalide',
    { 'WWW-Authenticate': WWW_AUTHENTICATE },
  );

const expiredToken = () =>
  new ApiProblem(HttpStatus.UNAUTHORIZED, 'Votre session a expiré.', 'jeton-expire', {
    'WWW-Authenticate': `${WWW_AUTHENTICATE}, error_description="expired"`,
  });

/**
 * Vérifie localement un jeton d'accès Keycloak : signature (clés publiques en cache),
 * émetteur, audience, client d'origine et type. Aucun appel à Keycloak par requête.
 */
@Injectable()
export class TokenVerifier {
  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(JWKS) private readonly keys: JWTVerifyGetKey,
  ) {}

  async verify(token: string): Promise<AuthUser> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.keys, {
        issuer: this.config.KEYCLOAK_ISSUER,
        audience: this.config.JWT_AUDIENCE,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat'],
        clockTolerance: 5,
      }));
    } catch (error) {
      if (error instanceof errors.JWTExpired) throw expiredToken();
      // Clés injoignables : panne de notre côté, pas un jeton invalide (500 journalisée).
      if (error instanceof errors.JWKSTimeout || !(error instanceof errors.JOSEError)) {
        throw error;
      }
      throw invalidToken();
    }

    // Jeton d'accès uniquement (pas un jeton d'identité ou de rafraîchissement),
    // émis pour un client autorisé à appeler l'API.
    if (payload.typ !== 'Bearer') throw invalidToken();
    if (typeof payload.azp !== 'string' || !this.config.JWT_CLIENTS.includes(payload.azp)) {
      throw invalidToken();
    }

    const realmRoles = (payload.realm_access as { roles?: unknown } | undefined)?.roles;
    const roles = (Array.isArray(realmRoles) ? realmRoles : []).filter(
      (r): r is Role => Role.safeParse(r).success,
    );
    const amr = Array.isArray(payload.amr) ? (payload.amr as unknown[]) : [];
    return {
      id: payload.sub!,
      roles,
      mfa: amr.some((m) => typeof m === 'string' && SECOND_FACTORS.includes(m)),
    };
  }
}
