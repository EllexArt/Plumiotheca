import { Body, Controller, Get, Logger, Module, Post, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Problem } from '@plumiotheca/contracts';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../src/app.module.js';
import { ApiProblem } from '../src/common/problem.js';
import { loadConfig } from '../src/config/env.js';
import { configureApp } from '../src/setup.js';

const NewStory = z.strictObject({ title: z.string().min(1).max(200) });

/** Routes d'essai, déclarées seulement dans les tests. */
@Controller('essai')
class EssaiController {
  private readonly logger = new Logger('Essai');

  @Post()
  create(@Body({ schema: NewStory }) body: z.infer<typeof NewStory>) {
    return body;
  }

  @Get('panne')
  panne() {
    // Forme d'une erreur de contrainte PostgreSQL remontée par TypeORM.
    const error = new Error('duplicate key value violates unique constraint "users_email_key"');
    Object.assign(error, {
      parameters: ['camille@exemple.fr'],
      driverError: {
        detail: 'Key (email)=(camille@exemple.fr) already exists.',
        parameters: ['camille@exemple.fr'],
      },
    });
    throw error;
  }

  @Get('dependance')
  dependance() {
    // Erreur d'un client HTTP (Keycloak, S3…) : ne concerne pas la personne.
    throw Object.assign(new Error('Request failed with status code 401'), { status: 401 });
  }

  @Get('conflit')
  conflit() {
    throw new ApiProblem(409, 'Ce titre est déjà utilisé dans cet univers.');
  }

  @Get('journal')
  journal() {
    this.logger.log(
      {
        user: { email: 'camille@exemple.fr' },
        ctx: { user: { email: 'camille@exemple.fr', refresh_token: 'jeton-secret' } },
        chapter: { content: 'Il était une fois' },
      },
      'essai',
    );
    return { ok: true };
  }
}

// nestjs-pino crée un seul journal par processus : une seule sortie pour tout le fichier.
const lines: string[] = [];
const logDestination = { write: (line: string) => void lines.push(line) };

let app: NestExpressApplication | undefined;
beforeEach(() => {
  lines.length = 0;
});
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function start(env: Record<string, string> = {}, controllers: Type[] = [EssaiController]) {
  const config = loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'info', ...env });
  @Module({ imports: [AppModule.forRoot(config, { logDestination })], controllers })
  class TestModule {}

  app = await NestFactory.create<NestExpressApplication>(TestModule, {
    bodyParser: false,
    logger: false,
  });
  configureApp(app, config);
  await app.init();
  return { http: request(app.getHttpServer()), logs: () => lines.join('') };
}

const expectProblem = (body: unknown, status: number) => {
  const problem = Problem.parse(body);
  expect(problem.status).toBe(status);
  return problem;
};

describe('santé', () => {
  it('répond sur /api/health avec les en-têtes de sécurité', async () => {
    const { http } = await start();
    const res = await http.get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('erreurs', () => {
  it('route inconnue : 404 au format problem+json', async () => {
    const { http } = await start();
    const res = await http.get('/api/inconnue').expect(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(expectProblem(res.body, 404).type).toBe('introuvable');
  });

  it('erreur inattendue : 500 sans aucun détail interne, journalisée sans donnée personnelle', async () => {
    const { http, logs } = await start();
    const res = await http.get('/api/essai/panne').expect(500);
    const problem = expectProblem(res.body, 500);
    expect(problem.type).toBe('interne');
    expect(problem.requestId).toBe(res.headers['x-request-id']);
    expect(JSON.stringify(res.body)).not.toMatch(/duplicate|users|camille|stack|at /);
    expect(logs()).toContain('Erreur non gérée');
    expect(logs()).not.toContain('camille@exemple.fr');
  });

  it('erreur d’une dépendance portant un statut 4xx : 500, journalisée', async () => {
    const { http, logs } = await start();
    const res = await http.get('/api/essai/dependance').expect(500);
    expect(expectProblem(res.body, 500).type).toBe('interne');
    expect(logs()).toContain('Request failed with status code 401');
  });

  it('erreur métier : message destiné à la personne', async () => {
    const { http } = await start();
    const res = await http.get('/api/essai/conflit').expect(409);
    expect(expectProblem(res.body, 409).detail).toBe('Ce titre est déjà utilisé dans cet univers.');
  });

  it('JSON illisible : 400, traçable par son identifiant', async () => {
    const { http, logs } = await start();
    const res = await http
      .post('/api/essai')
      .set('Content-Type', 'application/json')
      .send('{"title": ')
      .expect(400);
    const problem = expectProblem(res.body, 400);
    expect(problem.requestId).toBe(res.headers['x-request-id']);
    expect(problem.requestId).toBeDefined();
    expect(logs()).toContain('Corps de requête refusé');
  });

  it('corps trop volumineux : 413', async () => {
    const { http } = await start();
    const res = await http
      .post('/api/essai')
      .send({ title: 'x'.repeat(1_100_000) })
      .expect(413);
    const problem = expectProblem(res.body, 413);
    expect(problem.type).toBe('trop-volumineux');
    expect(problem.requestId).toBe(res.headers['x-request-id']);
  });
});

describe('validation par les contrats zod', () => {
  it('accepte un corps conforme', async () => {
    const { http } = await start();
    await http.post('/api/essai').send({ title: 'Les Lucioles' }).expect(201, {
      title: 'Les Lucioles',
    });
  });

  it('refuse un champ inconnu (400)', async () => {
    const { http } = await start();
    const res = await http
      .post('/api/essai')
      .send({ title: 'Les Lucioles', authorId: 'quelqu-un-d-autre' })
      .expect(400);
    const problem = expectProblem(res.body, 400);
    expect(problem.type).toBe('validation');
    expect(problem.errors).toEqual([expect.objectContaining({ code: 'unrecognized_keys' })]);
  });

  it('indique le champ en cause sans renvoyer la valeur reçue', async () => {
    const { http } = await start();
    const res = await http.post('/api/essai').send({ title: '' }).expect(400);
    const problem = expectProblem(res.body, 400);
    expect(problem.errors?.[0]).toMatchObject({ path: 'title', code: 'too_small' });
    // Messages en français, lisibles tels quels.
    expect(problem.errors?.[0]?.message).toMatch(/^Trop petit/);
  });
});

describe('CORS', () => {
  it('autorise les origines configurées uniquement', async () => {
    const { http } = await start({ CORS_ORIGINS: 'https://plumiotheca.example' });
    const ok = await http.get('/api/health').set('Origin', 'https://plumiotheca.example');
    expect(ok.headers['access-control-allow-origin']).toBe('https://plumiotheca.example');
    expect(ok.headers['access-control-allow-credentials']).toBeUndefined();
    const ko = await http.get('/api/health').set('Origin', 'https://intrus.example');
    expect(ko.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('limitation de débit', () => {
  it('répond 429 au-delà de la limite, sans bloquer la sonde de santé', async () => {
    const { http } = await start({ RATE_LIMIT_PER_MINUTE: '2' });
    await http.get('/api/essai/conflit').expect(409);
    await http.get('/api/essai/conflit').expect(409);
    const res = await http.get('/api/essai/conflit').expect(429);
    expect(expectProblem(res.body, 429).type).toBe('trop-de-requetes');
    expect(res.headers['retry-after']).toBeDefined();
    await http.get('/api/health').expect(200);
  });
});

describe('documentation OpenAPI', () => {
  it('est servie hors production, avec les schémas des contrats', async () => {
    const { http } = await start();
    const res = await http.get('/api/docs-json').expect(200);
    const doc = res.body as { paths: Record<string, { get?: { responses: object } }> };
    expect(doc.paths['/api/health']?.get?.responses).toHaveProperty('200');
  });

  it('n’existe pas en production', async () => {
    const { http } = await start({
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://plumiotheca.example',
      TRUST_PROXY: '1',
    });
    await http.get('/api/docs').expect(404);
    await http.get('/api/docs-json').expect(404);
  });
});

describe('journaux', () => {
  it('ne contiennent ni en-têtes, ni paramètres d’URL, ni e-mail, ni contenu', async () => {
    const { http, logs } = await start();
    await http
      .get('/api/essai/journal?email=camille@exemple.fr')
      .set('Authorization', 'Bearer jeton-secret')
      .set('Cookie', 'session=secret')
      .expect(200);
    const out = logs();
    expect(out).toContain('"path":"/api/essai/journal"');
    expect(out).toContain('[masqué]');
    expect(out).not.toMatch(/camille|jeton-secret|session=secret|Il était une fois/);
  });

  it('ignore l’identifiant de requête du client sans proxy de confiance', async () => {
    const { http } = await start();
    const res = await http.get('/api/health').set('X-Request-Id', 'proxy-1234abcd');
    expect(res.headers['x-request-id']).not.toBe('proxy-1234abcd');
  });

  it('derrière un proxy : reprend un identifiant valide, remplace un identifiant suspect', async () => {
    const { http } = await start({ TRUST_PROXY: '1' });
    const ok = await http.get('/api/health').set('X-Request-Id', 'proxy-1234abcd');
    expect(ok.headers['x-request-id']).toBe('proxy-1234abcd');
    const ko = await http.get('/api/health').set('X-Request-Id', 'faux journal <script>');
    expect(ko.headers['x-request-id']).not.toContain('faux');
  });
});
