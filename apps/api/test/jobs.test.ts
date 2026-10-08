import { Controller, type OnModuleInit } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service.js';
import { start } from './support.js';

/** Traces des tâches d'essai, partagées avec le test. */
const runs: { name: string; data: unknown; attempt: number }[] = [];

/** Tâches d'essai, déclarées comme le ferait un module de l'application. */
@Controller()
class EssaiTaches implements OnModuleInit {
  constructor(private readonly jobs: JobsService) {}

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
    // Échoue toujours, sans nouvelle tentative.
    this.jobs.define<{ email: string }>({
      name: 'essai-echec',
      retryLimit: 0,
      handle: () => Promise.reject(new TypeError('toujours en panne')),
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

describe('file de tâches', () => {
  it('désactivée par défaut dans les tests : rien n’est envoyé', async () => {
    const { app } = await start({}, [EssaiTaches]);
    const jobs = app.get(JobsService);
    expect(jobs.enabled).toBe(false);
    expect(await jobs.send('essai-reprise', { texte: 'x' })).toBeNull();
    await expect(jobs.send('inconnue', {})).rejects.toThrow('Tâche inconnue');
  });

  it(
    'une tâche en échec est rejouée ; l’échec définitif est journalisé sans les données',
    { timeout: 60_000 },
    async () => {
      runs.length = 0;
      const { app, logs } = await start({ JOBS_ENABLED: 'true' }, [EssaiTaches]);
      const jobs = app.get(JobsService);
      expect(await jobs.send('essai-reprise', { texte: 'bonjour' })).toEqual(expect.any(String));
      await until(() => runs.length >= 2);
      expect(runs.map((r) => r.attempt)).toEqual([1, 2]);
      expect(runs[1]?.data).toEqual({ texte: 'bonjour' });
      expect(logs()).toContain('Tâche en échec, nouvelle tentative prévue');

      await jobs.send('essai-echec', { email: 'camille@exemple.fr' });
      await until(() => logs().includes('Tâche en échec définitif'));
      const out = logs();
      expect(out).toContain('"name":"essai-echec"');
      expect(out).toContain('toujours en panne');
      // Les données de la tâche (ici une adresse) ne sont jamais journalisées.
      expect(out).not.toContain('camille@exemple.fr');
      expect(out).not.toContain('bonjour');
    },
  );
});
