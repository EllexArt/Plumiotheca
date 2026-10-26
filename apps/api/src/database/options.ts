import type { DataSourceOptions } from 'typeorm';
import type { Config } from '../config/env.js';
import { ChapterRevision } from '../stories/chapter-revision.entity.js';
import { Chapter } from '../stories/chapter.entity.js';
import { LibraryEntry } from '../stories/library-entry.entity.js';
import { Selection, SelectionItem } from '../stories/selection.entity.js';
import { ReadMark, ReadSalt } from '../stories/read-mark.entity.js';
import { SearchSync } from '../stories/search-sync.entity.js';
import { StoryTag } from '../stories/story-tag.entity.js';
import { Story } from '../stories/story.entity.js';
import { Tag } from '../tags/tag.entity.js';
import { HandleHistory } from '../users/handle-history.entity.js';
import { HandleRelease } from '../users/handle-release.entity.js';
import { User } from '../users/user.entity.js';
import { Media } from '../media/media.entity.js';
import { Notification } from '../notifications/notification.entity.js';
import { migrations } from './migrations/index.js';
import { SnakeNamingStrategy } from './naming.strategy.js';

export const entities = [
  User,
  HandleRelease,
  HandleHistory,
  Story,
  StoryTag,
  Chapter,
  ChapterRevision,
  ReadMark,
  ReadSalt,
  Tag,
  Media,
  LibraryEntry,
  Selection,
  SelectionItem,
  Notification,
  SearchSync,
];

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
