import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { describeError } from './common/logger.js';
import { type Config, loadConfig } from './config/env.js';
import { configureApp } from './setup.js';

let config: Config;
try {
  config = loadConfig(process.env);
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}

try {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config), {
    // Aucun journal avant pino : celui de Nest par défaut afficherait les erreurs en entier
    // (requête SQL, paramètres), hors masquage.
    logger: false,
    bodyParser: false,
    // Une erreur d'initialisation (base injoignable…) remonte ici au lieu d'un abort().
    abortOnError: false,
  });
  configureApp(app, config);
  await app.listen(config.PORT, config.HOST);
} catch (error) {
  // Message clair et sans secret ni valeur : jamais le mot de passe, jamais le détail SQL
  // (describeError ne garde, pour une erreur SQL, que le code, la contrainte et la table).
  const details = describeError(error as Error) as Record<string, unknown>;
  delete details.stack;
  const unreachable =
    typeof details.code === 'string' && /^(E[A-Z]+|28\w{3}|3D000|57P03)$/.test(details.code);
  const where = unreachable ? ` (base ${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME})` : '';
  console.error(JSON.stringify({ level: 60, msg: `Démarrage impossible${where}`, ...details }));
  process.exit(1);
}
