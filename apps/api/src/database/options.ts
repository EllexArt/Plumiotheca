import type { DataSourceOptions } from 'typeorm';
import type { Config } from '../config/env.js';
import { ChapterRevision } from '../stories/chapter-revision.entity.js';
import { Chapter } from '../stories/chapter.entity.js';
import { StoryTag } from '../stories/story-tag.entity.js';
import { Story } from '../stories/story.entity.js';
import { Tag } from '../tags/tag.entity.js';
import { HandleRelease } from '../users/handle-release.entity.js';
import { User } from '../users/user.entity.js';
import { migrations } from './migrations/index.js';
import { SnakeNamingStrategy } from './naming.strategy.js';

export const entities = [User, HandleRelease, Story, StoryTag, Chapter, ChapterRevision, Tag];

/** Connexion PostgreSQL commune à l'API, à la ligne de commande et aux tests. */
export function dataSourceOptions(config: Config): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.DB_HOST,
    port: config.DB_PORT,
    username: config.DB_USERNAME,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    ssl: config.DB_SSL,
    entities,
    migrations,
    namingStrategy: new SnakeNamingStrategy(),
    // Jamais de synchronisation automatique : le schéma ne change que par migration.
    synchronize: false,
    migrationsRun: config.DB_MIGRATE_ON_START,
    migrationsTransactionMode: 'each',
    // Pas de journal des requêtes SQL : elles peuvent contenir des données personnelles.
    logging: false,
    applicationName: 'plumiotheca-api',
  };
}
