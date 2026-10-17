import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  SEARCH_PAGE_SIZE,
  type SearchPage,
  type SearchQuery,
  type StorySummary,
} from '@plumiotheca/contracts';
import { DataSource, In } from 'typeorm';
import { z } from 'zod';
import { ApiProblem } from '../common/problem.js';
import { CONFIG } from '../config/config.module.js';
import type { Config } from '../config/env.js';
import { JobsService } from '../jobs/jobs.service.js';
import { StoriesService } from './stories.service.js';
import { publicStories } from './story-access.js';
import { Story } from './story.entity.js';

const SYNC_JOB = 'indexation-histoire';

/** Réglages de l'index : où chercher, sur quoi filtrer ; seul l'identifiant est renvoyé. */
const SETTINGS = {
  searchableAttributes: ['title', 'tags', 'authorName', 'authorHandle', 'summary'],
  filterableAttributes: ['language', 'rating', 'majorWarnings', 'contentWarnings'],
  displayedAttributes: ['id'],
};

/** Ce que l'index connaît d'une histoire publiée : rien d'autre que sa fiche publique. */
function toDocument(story: StorySummary) {
  return {
    id: story.id,
    title: story.title,
    summary: story.summary,
    tags: story.tags,
    authorName: story.author.displayName,
    authorHandle: story.author.handle,
    language: story.language,
    rating: story.rating,
    majorWarnings: story.majorWarnings ?? [],
    contentWarnings: story.contentWarnings,
  };
}

const Task = z.object({ taskUid: z.int() });
const TaskState = z.object({
  status: z.enum(['enqueued', 'processing', 'succeeded', 'failed', 'canceled']),
  error: z.object({ code: z.string() }).nullish(),
});
const Hits = z.object({
  hits: z.array(z.object({ id: z.string() })),
  estimatedTotalHits: z.int().optional(),
});

class MeiliError extends Error {
  override name = 'MeiliError';
  constructor(
    readonly status: number,
    readonly code: string | undefined,
  ) {
    super(`Meilisearch : ${status} ${code ?? ''}`.trim());
  }
}

/**
 * Recherche dans les histoires publiées (#82, décision 13), avec Meilisearch interrogé par
 * l'API seulement (la clé ne quitte jamais le serveur). L'index ne contient que les
 * histoires publiques ; chaque changement d'une histoire la met en file de réindexation,
 * et une réindexation complète passe chaque nuit (renommages, comptes verrouillés…).
 * Les résultats sont relus dans la base : un résultat devenu invisible n'est jamais montré.
 */
@Injectable()
export class SearchService implements OnModuleInit, OnApplicationBootstrap {
  private readonly logger = new Logger('Recherche');

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @InjectDataSource() private readonly db: DataSource,
    private readonly stories: StoriesService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.define<{ id: string }>({
      name: SYNC_JOB,
      handle: async ({ id }) => void (await this.sync(id)),
    });
    this.jobs.define({
      name: 'reindexation-recherche',
      cron: '41 4 * * *',
      handle: async () => void (await this.reindexAll()),
      expireInSeconds: 30 * 60,
    });
  }

  /** Index et réglages au démarrage ; Meilisearch absent n'empêche pas l'API de démarrer. */
  async onApplicationBootstrap() {
    try {
      await this.prepare(this.config.SEARCH_INDEX);
    } catch (error) {
      this.logger.warn(
        { failure: { type: (error as Error).name, code: (error as MeiliError).code } },
        'Index de recherche non préparé (Meilisearch injoignable ?)',
      );
    }
  }

  /** Après un changement d'une histoire : réindexée en arrière-plan. */
  async queue(storyId: string): Promise<void> {
    try {
      await this.jobs.send(SYNC_JOB, { id: storyId });
    } catch (error) {
      // Jamais bloquant : la réindexation de nuit rattrape l'histoire.
      this.logger.warn(
        { failure: { type: (error as Error).name } },
        'Réindexation non mise en file',
      );
    }
  }

  /** Met l'histoire dans l'index si elle est publique, l'en retire sinon. Numéro de tâche. */
  async sync(storyId: string): Promise<number> {
    const [story] = await this.publicSummaries([storyId]);
    const index = this.config.SEARCH_INDEX;
    const task = story
      ? await this.call(`/indexes/${index}/documents`, 'POST', [toDocument(story)])
      : await this.call(`/indexes/${index}/documents/${storyId}`, 'DELETE');
    return Task.parse(task).taskUid;
  }

  /**
   * Reconstruit l'index entier dans un index temporaire, puis l'échange avec l'index en
   * service : la recherche reste disponible pendant la reconstruction.
   */
  async reindexAll(): Promise<{ indexed: number }> {
    const index = this.config.SEARCH_INDEX;
    const fresh = `${index}_reconstruction`;
    await this.prepare(index);
    await this.waitForTask(
      Task.parse(await this.call(`/indexes/${fresh}`, 'DELETE')).taskUid,
    ).catch(ignoreMissing);
    await this.prepare(fresh);
    let indexed = 0;
    let last: number | null = null;
    for (let offset = 0; ; offset += 500) {
      const ids = (
        await publicStories(
          this.db
            .getRepository(Story)
            .createQueryBuilder('story')
            .innerJoin('story.author', 'author'),
        )
          .select('story.id', 'id')
          .orderBy('story.id')
          .offset(offset)
          .limit(500)
          .getRawMany<{ id: string }>()
      ).map((r) => r.id);
      if (!ids.length) break;
      const summaries = await this.publicSummaries(ids);
      last = Task.parse(
        await this.call(`/indexes/${fresh}/documents`, 'POST', summaries.map(toDocument)),
      ).taskUid;
      indexed += summaries.length;
    }
    if (last !== null) await this.waitForTask(last);
    await this.waitForTask(
      Task.parse(await this.call('/swap-indexes', 'POST', [{ indexes: [index, fresh] }])).taskUid,
    );
    await this.call(`/indexes/${fresh}`, 'DELETE');
    this.logger.log({ indexed }, 'Index de recherche reconstruit');
    return { indexed };
  }

  async search(query: SearchQuery): Promise<SearchPage> {
    const filter: string[] = [];
    if (query.langue) filter.push(`language = ${JSON.stringify(query.langue)}`);
    if (query.classement) filter.push(`rating = ${JSON.stringify(query.classement)}`);
    if (query.exclureClassement?.length) {
      filter.push(`rating NOT IN ${JSON.stringify(query.exclureClassement)}`);
    }
    // Avertissements exclus : « majeurs » et facultatifs (#152).
    const excluded = [
      query.exclure?.length && `majorWarnings IN ${JSON.stringify(query.exclure)}`,
      query.exclureAutres?.length && `contentWarnings IN ${JSON.stringify(query.exclureAutres)}`,
    ].filter((f): f is string => Boolean(f));
    const index = `/indexes/${this.config.SEARCH_INDEX}/search`;
    let result: z.infer<typeof Hits>;
    let hidden: number | undefined;
    try {
      result = Hits.parse(
        await this.call(index, 'POST', {
          q: query.q,
          filter: [...filter, ...excluded.map((f) => `NOT ${f}`)],
          offset: (query.page - 1) * SEARCH_PAGE_SIZE,
          // Un de plus : y a-t-il une page suivante ?
          limit: SEARCH_PAGE_SIZE + 1,
          attributesToRetrieve: ['id'],
        }),
      );
      // Ce qui a été masqué, pour le dire : mêmes filtres, avertissements exclus inversés.
      if (excluded.length && query.page === 1) {
        hidden = Hits.parse(
          await this.call(index, 'POST', {
            q: query.q,
            filter: [...filter, excluded.join(' OR ')],
            limit: 0,
          }),
        ).estimatedTotalHits;
      }
    } catch (error) {
      this.logger.warn(
        { failure: { type: (error as Error).name, code: (error as MeiliError).code } },
        'Recherche impossible',
      );
      throw new ApiProblem(
        HttpStatus.SERVICE_UNAVAILABLE,
        'La recherche est momentanément indisponible. Réessayez dans un instant.',
      );
    }
    const ids = result.hits.slice(0, SEARCH_PAGE_SIZE).map((h) => h.id);
    // Relu dans la base : une histoire dépubliée depuis l'indexation n'apparaît pas, ni une
    // histoire dont les avertissements ont changé depuis (index en retard).
    const masked = (story: StorySummary) =>
      (story.majorWarnings ?? []).some((w) => query.exclure?.includes(w)) ||
      story.contentWarnings.some((w) => query.exclureAutres?.includes(w));
    const found = new Map(
      (await this.publicSummaries(ids)).filter((s) => !masked(s)).map((s) => [s.id, s]),
    );
    return {
      items: ids.flatMap((id) => found.get(id) ?? []),
      total: result.estimatedTotalHits ?? ids.length,
      nextPage: result.hits.length > SEARCH_PAGE_SIZE ? query.page + 1 : null,
      ...(hidden === undefined ? {} : { hidden }),
    };
  }

  /** Attend qu'une tâche Meilisearch soit traitée (réindexation, tests). */
  async waitForTask(uid: number, timeoutMs = 10_000): Promise<void> {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const task = TaskState.parse(await this.call(`/tasks/${uid}`, 'GET'));
      if (task.status === 'succeeded') return;
      if (task.status === 'failed' || task.status === 'canceled') {
        throw new MeiliError(500, task.error?.code ?? task.status);
      }
      if (Date.now() > end) throw new MeiliError(504, 'task_timeout');
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  /** Fiches publiques de ces histoires (les autres sont ignorées). */
  private async publicSummaries(ids: string[]): Promise<StorySummary[]> {
    if (!ids.length) return [];
    const stories = await publicStories(
      this.db
        .getRepository(Story)
        .createQueryBuilder('story')
        .innerJoinAndSelect('story.author', 'author')
        .where({ id: In(ids) }),
    ).getMany();
    return this.stories.summaries(this.db.manager, stories, false);
  }

  private async prepare(uid: string) {
    const created = await this.call('/indexes', 'POST', { uid, primaryKey: 'id' });
    await this.waitForTask(Task.parse(created).taskUid).catch((error: unknown) => {
      if ((error as MeiliError).code !== 'index_already_exists') throw error;
    });
    await this.waitForTask(
      Task.parse(await this.call(`/indexes/${uid}/settings`, 'PATCH', SETTINGS)).taskUid,
    );
  }

  private async call(path: string, method: string, body?: unknown): Promise<unknown> {
    const response = await fetch(new URL(path, this.config.MEILI_URL), {
      method,
      headers: {
        ...(this.config.MEILI_MASTER_KEY
          ? { Authorization: `Bearer ${this.config.MEILI_MASTER_KEY}` }
          : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    const payload: unknown =
      response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      throw new MeiliError(response.status, (payload as { code?: string } | null)?.code);
    }
    return payload;
  }
}

function ignoreMissing(error: unknown) {
  if ((error as MeiliError).code !== 'index_not_found') throw error;
}
