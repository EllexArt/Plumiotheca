import { type DynamicModule, Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import type { JWTVerifyGetKey } from 'jose';
import type { DestinationStream } from 'pino';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { loggerParams } from './common/logger.js';
import { ProblemFilter, ValidationFailed } from './common/problem.js';
import { ConfigModule } from './config/config.module.js';
import type { Config } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { MeModule } from './me/me.module.js';

export interface AppOptions {
  /** Sortie des journaux (tests) ; la sortie standard par défaut. */
  logDestination?: DestinationStream;
  /** Clés de vérification des jetons (tests) ; celles de Keycloak par défaut. */
  jwks?: JWTVerifyGetKey;
}

@Module({})
export class AppModule {
  static forRoot(config: Config, options: AppOptions = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        LoggerModule.forRoot(loggerParams(config, options.logDestination)),
        ThrottlerModule.forRoot({
          throttlers: [{ ttl: 60_000, limit: config.RATE_LIMIT_PER_MINUTE }],
        }),
        DatabaseModule,
        AuthModule.forRoot(options.jwks),
        HealthModule,
        MeModule,
      ],
      providers: [
        // Ordre des gardes : limitation de débit, puis authentification et rôles.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_FILTER, useClass: ProblemFilter },
        // Paramètres déclarés avec un schéma (`@Body({ schema })`) : validés par zod.
        {
          provide: APP_PIPE,
          useValue: new StandardSchemaValidationPipe({
            exceptionFactory: (issues) => ValidationFailed.fromStandardSchema(issues),
          }),
        },
      ],
    };
  }
}
