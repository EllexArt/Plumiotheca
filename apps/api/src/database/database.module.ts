import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CONFIG } from '../config/config.module.js';
import type { Config } from '../config/env.js';
import { dataSourceOptions } from './options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [CONFIG],
      useFactory: (config: Config) => ({
        ...dataSourceOptions(config),
        // Base injoignable au démarrage : quelques essais, puis arrêt avec un code d'erreur.
        retryAttempts: config.DB_CONNECT_RETRIES,
        retryDelay: 2_000,
      }),
    }),
  ],
})
export class DatabaseModule {}
