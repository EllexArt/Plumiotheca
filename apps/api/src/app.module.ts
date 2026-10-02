import { type DynamicModule, Module, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import type { DestinationStream } from 'pino';
import { loggerParams } from './common/logger.js';
import { ProblemFilter, ValidationFailed } from './common/problem.js';
import { ConfigModule } from './config/config.module.js';
import type { Config } from './config/env.js';
import { HealthModule } from './health/health.module.js';

export interface AppOptions {
  /** Sortie des journaux (tests) ; la sortie standard par défaut. */
  logDestination?: DestinationStream;
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
        HealthModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
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
