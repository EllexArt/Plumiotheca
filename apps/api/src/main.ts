import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
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
    bufferLogs: true,
    bodyParser: false,
    // Une erreur d'initialisation (base injoignable…) remonte ici au lieu d'un abort().
    abortOnError: false,
  });
  configureApp(app, config);
  await app.listen(config.PORT, config.HOST);
} catch (error) {
  // Message clair, sans secret : l'hôte et la base, jamais le mot de passe.
  console.error(
    `Démarrage impossible (base ${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}) : ${
      (error as Error).message
    }`,
  );
  process.exit(1);
}
