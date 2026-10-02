import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { Config } from './env.js';

/** Jeton d'injection de la configuration validée : `@Inject(CONFIG) config: Config`. */
export const CONFIG = Symbol('CONFIG');

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: Config): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: CONFIG, useValue: Object.freeze(config) }],
      exports: [CONFIG],
    };
  }
}
