import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { Config } from './config/env.js';

export const API_PREFIX = 'api';
const DOCS_PATH = `${API_PREFIX}/docs`;

/** En-têtes de sécurité : l'API ne sert que du JSON, rien ne doit s'y exécuter ni s'y afficher. */
const strictHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
});

/** Page de documentation (hors production) : ses propres scripts et styles uniquement. */
const docsHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // Swagger UI ajoute deux petits blocs <style> dans sa page.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: null,
    },
  },
});

/** Réglages HTTP communs au serveur et aux tests. */
export function configureApp(app: NestExpressApplication, config: Config): INestApplication {
  const docs = config.NODE_ENV !== 'production';

  app.useLogger(app.get(Logger));
  app.set('trust proxy', config.TRUST_PROXY);
  app.use((req: Request, res: Response, next: NextFunction) =>
    (docs && req.path.startsWith(`/${DOCS_PATH}`) ? docsHeaders : strictHeaders)(req, res, next),
  );
  app.enableCors({
    origin: config.CORS_ORIGINS,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'If-Match', 'X-Request-Id'],
    exposedHeaders: ['ETag', 'Retry-After', 'X-Request-Id'],
    // Jetons dans l'en-tête Authorization, jamais de cookie : pas d'identifiants CORS.
    credentials: false,
    maxAge: 600,
  });
  // Seul le JSON est accepté ; 1 Mo couvre un long chapitre au format TipTap.
  app.useBodyParser('json', { limit: '1mb' });
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();

  if (docs) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('API Plumiotheca')
        .setDescription('Documentation générée (hors production uniquement).')
        .setVersion('0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(DOCS_PATH, app, document);
  }
  return app;
}
