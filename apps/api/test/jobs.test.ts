import { Controller, type OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service.js';
import { start } from './support.js';

/** Traces des tâches d'essai, partagées avec le test. */
const runs: { name: string; data: unknown; attempt: number }[] = [];
/** Nouvelles tentatives de la file « essai-limite » (modifiée d'un démarrage à l'autre). */
let limit = 0;
/** Résultat de la tâche lente (arrêt pendant son exécution). */
let slow = '';

/** Tâches d'essai, déclarées comme le ferait un module de l'application. */
@Controller()
class EssaiTaches implements OnModuleInit {
  constructor(
    private readonly jobs: JobsService,
    private readonly db: DataSource,
  ) {}

  onModuleInit() {
    // Échoue à la première tentative, réussit à la seconde.
    this.jobs.define<{ texte: string }>({
      name: 'essai-reprise',
      retryDelaySeconds: 1,
      handle: (data, job) => {
        runs.push({ name: job.name, data, attempt: job.retryCount + 1 });
        if (job.retryCount === 0) return Promise.reject(new Error('panne passagère'));
        return Promise.resolve();
      },
    });
    // Échoue toujours, sans nouvelle tentative ; le message cite une donnée personnelle.
    this.jobs.define<{ email: string }>({
      name: 'essai-echec',
      retryLimit: 0,
      handle: (data) => Promise.reject(new TypeError(`panne pour ${data.email}`)),
    });
    this.jobs.define({
      name: 'essai-limite',
      retryLimit: limit,
      retryDelaySeconds: 1,
      handle: () => Promise.reject(new RangeError('toujours')),
    });
    // Tâche longue qui a encore besoin de la base quand l'application s'arrête.
    this.jobs.define({
      name: 'essai-lente',
      handle: async () => {
        slow = 'en cours';
        await new Promise((r) => setTimeout(r, 1_500));
        try {
          await this.db.query('SELECT 1');
          slow = 'requête ok';
        } catch (error) {
          slow = (error as Error).message;
        }
      },
    });
  }
}

async function until(check: () => boolean, timeout = 20_000) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end) throw new Error('Délai dépassé');
    await new Promise((r) => setTimeout(r, 200));
  }
}

const enabled = { JOBS_ENABLED: 'true' };

describe('file de tâches', () => {
  it('désactivée par défaut dans les tests : rien n’est envoyé', async () => {
    const { app } = await start({}, [EssaiTaches]);
    const jobs = app.get(JobsService);
    expect(jobs.enabled).toBe(false);
    expect(await jobs.send('essai-reprise', { texte: 'x' })).toBeNull();
    await expect(jobs.send('inconnue', {})).rejects.toThrow('Tâche inconnue');
  });

  it('une tâche en échec est rejouée', { timeout: 60_000 }, async () => {
    runs.length = 0;
    const { app, logs } = await start(enabled, [EssaiTaches]);
    const jobs = app.get(JobsService);
    expect(await jobs.send('essai-reprise', { texte: 'bonjour' })).toEqual(expect.any(String));
    await until(() => runs.length >= 2);
    expect(runs.map((r) => r.attempt)).toEqual([1, 2]);
    expect(runs[1]?.data).toEqual({ texte: 'bonjour' });
    expect(logs()).toContain('Tâche en échec, nouvelle tentative prévue');
    expect(logs()).not.toContain('bonjour');
  });

  it(
    'échec définitif : journalisé avec le type d’erreur, sans données ni message, ni dans le journal ni dans la base',
    { timeout: 60_000 },
    async () => {
      const { app, logs } = await start(enabled, [EssaiTaches]);
      const id = await app.get(JobsService).send('essai-echec', { email: 'camille@exemple.fr' });
      await until(() => logs().includes('Tâche en échec définitif'));
      const out = logs();
      expect(out).toContain('"name":"essai-echec"');
      expect(out).toContain('"type":"TypeError"');
      expect(out).not.toContain('camille');
      // pg-boss garde l'erreur relancée dans sa table : ni message d'origine ni pile.
      const [row] = await app
        .get(DataSource)
        .query<{ output: unknown }[]>(`SELECT output FROM pgboss.job WHERE id = $1`, [id]);
      expect(JSON.stringify(row?.output)).toContain('Échec de la tâche (TypeError)');
      expect(JSON.stringify(row?.output)).not.toContain('camille');
    },
  );

  it(
    'limite de tentatives modifiée dans le code : appliquée à la file existante',
    { timeout: 60_000 },
    async () => {
      limit = 0;
      const first = await start(enabled, [EssaiTaches]);
      await first.app.close();
      limit = 1;
      const { app, logs } = await start(enabled, [EssaiTaches]);
      await app.get(JobsService).send('essai-limite', {});
      await until(() => logs().includes('Tâche en échec définitif'));
      expect(logs()).toContain('Tâche en échec, nouvelle tentative prévue');
      expect(logs()).toContain('"of":2');
    },
  );

  it(
    'arrêt pendant une tâche : elle finit, base comprise, avant la fermeture',
    { timeout: 60_000 },
    async () => {
      slow = '';
      const { app } = await start(enabled, [EssaiTaches]);
      await app.get(JobsService).send('essai-lente', {});
      await until(() => slow === 'en cours');
      await app.close();
      expect(slow).toBe('requête ok');
    },
  );
});
