import pg from 'pg';
import { DataSource } from 'typeorm';
import { loadConfig } from '../src/config/env.js';
import { dataSourceOptions } from '../src/database/options.js';
import { TEST_DB_NAME, testDbEnv } from './db-env.js';

/** Recrée la base de test et y applique les migrations, comme sur une base vide. */
export default async function setup() {
  const config = loadConfig({ NODE_ENV: 'test', ...testDbEnv() });
  const admin = new pg.Client({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USERNAME,
    password: config.DB_PASSWORD,
    database: 'postgres',
  });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      `Base de test injoignable (${config.DB_HOST}:${config.DB_PORT}) : lancez « pnpm infra:up ». ${
        (error as Error).message
      }`,
      { cause: error },
    );
  }
  await admin.query(`DROP DATABASE IF EXISTS "${TEST_DB_NAME}" WITH (FORCE)`);
  await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
  await admin.end();

  const dataSource = new DataSource(dataSourceOptions(config));
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  await dataSource.destroy();
}
