import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { loadConfig } from '../config/env.js';
import { SearchService } from '../stories/search.service.js';

/**
 * Réindexation complète de la recherche (#82), à la demande :
 *   pnpm --filter @plumiotheca/api search:reindex
 * Sans file de tâches ni serveur HTTP ; l’index en service reste disponible pendant la
 * reconstruction (échange d’index à la fin).
 */
const config = loadConfig({ ...process.env, JOBS_ENABLED: 'false' });
const app = await NestFactory.createApplicationContext(AppModule.forRoot(config), {
  logger: false,
  abortOnError: false,
});
try {
  const { indexed } = await app.get(SearchService).reindexAll();
  console.log(`✓ Index « ${config.SEARCH_INDEX} » reconstruit : ${indexed} histoire(s)`);
} catch (error) {
  console.error(`Réindexation impossible : ${(error as Error).name}`);
  process.exitCode = 1;
} finally {
  await app.close();
}
