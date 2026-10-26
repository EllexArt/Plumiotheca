import { type DynamicModule, Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import type { JWTVerifyGetKey } from 'jose';
import type { DestinationStream } from 'pino';
import { AccountGuard } from './account/account.guard.js';
import { AccountModule } from './account/account.module.js';
import { AuthGuard } from './auth/auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { loggerParams } from './common/logger.js';
import { ProblemFilter, ValidationFailed } from './common/problem.js';
import { AccountThrottlerGuard, FLOOD, FloodGuard } from './common/throttling.js';
import { ConfigModule } from './config/config.module.js';
import type { Config } from './config/env.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { JobsModule } from './jobs/jobs.module.js';
import { MediaModule } from './media/media.module.js';
import { MeModule } from './me/me.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { StoriesModule } from './stories/stories.module.js';

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
          throttlers: [
            { name: FLOOD, ttl: 60_000, limit: config.RATE_LIMIT_IP_PER_MINUTE },
            { name: 'default', ttl: 60_000, limit: config.RATE_LIMIT_PER_MINUTE },
          ],
        }),
        DatabaseModule,
        JobsModule,
        AuthModule.forRoot(options.jwks),
        HealthModule,
        MeModule,
        AccountModule,
        StoriesModule,
        MediaModule,
        NotificationsModule,
      ],
      providers: [
        // Ordre des gardes : plafond par adresse IP (inondation), authentification et rôles,
        // puis limites de chaque route par compte (par IP sans compte, #137).
        { provide: APP_GUARD, useClass: FloodGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: AccountThrottlerGuard },
        // Puis le compte de l'application : première visite, charte, âge.
        { provide: APP_GUARD, useClass: AccountGuard },
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
