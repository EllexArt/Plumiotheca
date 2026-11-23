import {
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  MAX_SAVED_SEARCHES,
  explorerToApi,
  ReadingLimits,
  SearchQuery,
  StoryQuery,
  type NewSavedSearch,
  type SavedSearch,
  type StorySummary,
  type UpdateSavedSearch,
} from '@plumiotheca/contracts';
import { DataSource } from 'typeorm';
import { ApiProblem } from '../common/problem.js';
import { JobsService } from '../jobs/jobs.service.js';
import { Notification } from '../notifications/notification.entity.js';
import { SavedSearchEntry } from '../notifications/saved-search.entity.js';
import { User } from '../users/user.entity.js';
import { SearchService } from './search.service.js';
import { StoriesService } from './stories.service.js';

const view = (s: SavedSearchEntry): SavedSearch => ({
  id: s.id,
  name: s.name,
  query: s.query,
  alerts: s.alerts,
  createdAt: s.createdAt.toISOString(),
});

/** Histoires citées dans une alerte (les autres sont seulement comptées). */
const CITED = 3;

/**
 * Recherches enregistrées (#80). Chaque matin, pour chaque recherche dont l'alerte est
 * active : les histoires publiées depuis la vérification précédente, avec les filtres de la
 * recherche et Mes limites de la personne ; s'il y en a, une seule notification groupée.
 * L'e-mail groupé arrivera avec les e-mails transactionnels (#71).
 */
@Injectable()
export class SavedSearchesService implements OnModuleInit {
  private readonly logger = new Logger('Recherches enregistrées');

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly stories: StoriesService,
    private readonly search: SearchService,
    private readonly jobs: JobsService,
  ) {}

  onModuleInit() {
    this.jobs.define({
      name: 'alertes-recherches',
      cron: '23 7 * * *',
      handle: async () => void (await this.runAlerts()),
      expireInSeconds: 30 * 60,
    });
  }

  private get repo() {
    return this.db.getRepository(SavedSearchEntry);
  }

  async list(user: User): Promise<SavedSearch[]> {
    const rows = await this.repo.find({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' },
    });
    return rows.map(view);
  }

  async create(user: User, input: NewSavedSearch): Promise<SavedSearch> {
    return this.db.transaction(async (tx) => {
      // Un enregistrement à la fois par personne : la limite tient même en double clic.
      await tx.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);
      const count = await tx.getRepository(SavedSearchEntry).countBy({ user: { id: user.id } });
      if (count >= MAX_SAVED_SEARCHES) {
        throw new ApiProblem(
          HttpStatus.CONFLICT,
          `${MAX_SAVED_SEARCHES} recherches enregistrées au plus : supprimez-en une d’abord.`,
          'trop-de-recherches',
        );
      }
      const saved = await tx.getRepository(SavedSearchEntry).save({
        user: { id: user.id },
        name: input.name,
        query: input.query,
        alerts: input.alerts,
      });
      return view(saved);
    });
  }

  async update(user: User, id: string, input: UpdateSavedSearch): Promise<SavedSearch> {
    const saved = await this.owned(user, id);
    const changes: Partial<Pick<SavedSearchEntry, 'name' | 'alerts' | 'checkedAt'>> = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.alerts !== undefined) changes.alerts = input.alerts;
    // Alerte réactivée : seules les histoires publiées à partir de maintenant comptent.
    if (input.alerts && !saved.alerts) changes.checkedAt = new Date();
    if (Object.keys(changes).length) await this.repo.update(saved.id, changes);
    return view(await this.owned(user, id));
  }

  async remove(user: User, id: string): Promise<void> {
    await this.repo.delete({ id: (await this.owned(user, id)).id });
  }

  private async owned(user: User, id: string): Promise<SavedSearchEntry> {
    const saved = await this.repo.findOneBy({ id, user: { id: user.id } });
    if (!saved) throw new NotFoundException();
    return saved;
  }

  /** Vérifie toutes les recherches dont l'alerte est active ; nombre d'alertes créées. */
  async runAlerts(): Promise<number> {
    const searches = await this.repo
      .createQueryBuilder('ss')
      .innerJoinAndSelect('ss.user', 'u')
      .where('ss.alerts = true')
      .andWhere(`u.status = 'active'`)
      .getMany();
    let created = 0;
    for (const saved of searches) {
      try {
        if (await this.check(saved)) created += 1;
      } catch (error) {
        // Recherche indisponible : la même période sera revue demain.
        this.logger.warn(
          { failure: { type: (error as Error).name } },
          'Alerte de recherche non vérifiée',
        );
      }
    }
    if (created) this.logger.log({ created }, 'Alertes de recherches envoyées');
    return created;
  }

  /** Une recherche : nouvelles histoires depuis la dernière vérification ; vrai si alerte. */
  private async check(saved: SavedSearchEntry): Promise<boolean> {
    // Prise de la recherche : une seule vérification par période, même si deux tâches se
    // croisent (la seconde ne trouve plus la date qu'elle a lue).
    const [, claimed] = await this.db.query<[unknown, number]>(
      // À la milliseconde, comme la date JavaScript lue.
      `UPDATE saved_searches SET checked_at = date_trunc('milliseconds', now())
       WHERE id = $1 AND date_trunc('milliseconds', checked_at) = $2`,
      [saved.id, saved.checkedAt],
    );
    if (!claimed) return false;
    let found: Awaited<ReturnType<SavedSearchesService['newStories']>>;
    try {
      found = await this.newStories(saved, saved.checkedAt);
    } catch (error) {
      // Recherche indisponible : la période sera revue à la prochaine vérification.
      await this.repo.update(saved.id, { checkedAt: saved.checkedAt });
      throw error;
    }
    if (!found?.count) return false;
    await this.db.getRepository(Notification).insert({
      user: { id: saved.user.id },
      kind: 'saved_search',
      savedSearch: { id: saved.id },
      data: { count: found.count, storyIds: found.items.slice(0, CITED).map((s) => s.id) },
    });
    return true;
  }

  /**
   * Histoires publiées après `since`, avec les paramètres de la recherche et Mes limites ;
   * null si les paramètres ne sont plus valides (ils sont alors ignorés).
   */
  private async newStories(
    saved: SavedSearchEntry,
    since: Date,
  ): Promise<{ count: number; items: StorySummary[] } | null> {
    const { api, sans } = explorerToApi(Object.fromEntries(new URLSearchParams(saved.query)));
    const limits = ReadingLimits.safeParse(saved.user.limits).data;
    const join = (...lists: (readonly string[] | string | undefined)[]) =>
      [
        ...new Set(
          lists.flatMap((l) => (typeof l === 'string' ? l.split(',') : (l ?? []))).filter(Boolean),
        ),
      ].join(',') || undefined;
    const common = {
      publieesDepuis: since.toISOString(),
      exclure: join(api.exclure, limits?.hiddenMajorWarnings),
      exclureAutres: join(limits?.hiddenContentWarnings),
      masquerTags: join(sans, limits?.hiddenTags),
    };
    const rest = api;
    const strip = (o: Record<string, string | undefined>) =>
      Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
    if (rest.q) {
      const query = SearchQuery.safeParse(strip({ ...rest, ...common, page: '1' }));
      if (!query.success) return null;
      const page = await this.search.search(query.data);
      return { count: page.total, items: page.items };
    }
    const query = StoryQuery.safeParse(strip({ ...rest, ...common, limite: String(CITED) }));
    if (!query.success) return null;
    const page = await this.stories.list(query.data);
    return { count: page.total ?? page.items.length, items: page.items };
  }
}
