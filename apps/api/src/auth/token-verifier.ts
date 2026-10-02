import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { Role, ROLES_WITH_MFA } from '@plumiotheca/contracts';
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

/** Erreurs qui tiennent au jeton lui-même : la personne doit se reconnecter. */
const TOKEN_ERRORS = [
  errors.JWSInvalid,
  errors.JWTInvalid,
  errors.JWTClaimValidationFailed,
  errors.JWSSignatureVerificationFailed,
  errors.JWKSNoMatchingKey,
  // Jeton sans « kid » quand plusieurs clés sont publiées (rotation).
  errors.JWKSMultipleMatchingKeys,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
  errors.JWEInvalid,
];

const keysUnavailable = () =>
  new ApiProblem(
    HttpStatus.SERVICE_UNAVAILABLE,
    'La connexion est momentanément indisponible. Réessayez dans un instant.',
    'indisponible',
    { 'Retry-After': '30' },
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
  private readonly logger = new Logger(TokenVerifier.name);

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
      if (TOKEN_ERRORS.some((type) => error instanceof type)) throw invalidToken();
      // Clés de Keycloak illisibles ou injoignables (panne, mauvaise adresse) : ce n'est
      // pas la faute de la personne, on ne la déconnecte pas et on alerte.
      this.logger.error({ err: error }, 'Clés publiques de Keycloak indisponibles');
      throw keysUnavailable();
    }

    // Jeton d'accès uniquement (pas un jeton d'identité ou de rafraîchissement),
    // émis pour un client autorisé à appeler l'API.
    if (payload.typ !== 'Bearer') throw invalidToken();
    if (typeof payload.azp !== 'string' || !this.config.JWT_CLIENTS.includes(payload.azp)) {
      throw invalidToken();
    }

    const realmRoles = (payload.realm_access as { roles?: unknown } | undefined)?.roles;
    const held = (Array.isArray(realmRoles) ? realmRoles : []).filter(
      (r): r is Role => Role.safeParse(r).success,
    );
    const amr = Array.isArray(payload.amr) ? (payload.amr as unknown[]) : [];
    const mfa = amr.some((m) => typeof m === 'string' && SECOND_FACTORS.includes(m));
    const needsMfa = (role: Role) => !mfa && ROLES_WITH_MFA.includes(role);
    return {
      id: payload.sub!,
      roles: held.filter((role) => !needsMfa(role)),
      rolesAwaitingMfa: held.filter(needsMfa),
      mfa,
    };
  }
}
