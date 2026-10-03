// Source de données de la ligne de commande TypeORM (migrations), lancée sur le code
// compilé : voir les scripts « migration:* » de package.json.
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/env.js';
import { dataSourceOptions } from './options.js';

export default new DataSource({
  ...dataSourceOptions(loadConfig(process.env)),
  migrationsRun: false,
});
