import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  CHARTER_VERSION,
  type FirstVisit,
  HANDLE_CHANGE_DAYS,
  HANDLE_RELEASE_DAYS,
  handleKey,
  type MyAccount,
  type PublicProfile,
  type UpdateProfile,
} from '@plumiotheca/contracts';
import { DataSource, type EntityManager, IsNull, MoreThan, QueryFailedError } from 'typeorm';
import { ApiProblem } from '../common/problem.js';
import { HandleHistory } from '../users/handle-history.entity.js';
import { HandleRelease } from '../users/handle-release.entity.js';
import { User } from '../users/user.entity.js';
import { accountStep } from './account-step.js';
import { isReservedName } from './reserved-handles.js';

const DAY = 24 * 60 * 60 * 1000;

/** Message unique du refus d'âge (garde et première visite). */
export const AGE_LOCKED_MESSAGE =
  'Plumiotheca est ouverte à partir de 15 ans : ce compte ne peut pas être utilisé. Reviens quand tu auras 15 ans, on t’attend !';

export const ageLocked = () =>
  new ApiProblem(HttpStatus.FORBIDDEN, AGE_LOCKED_MESSAGE, 'age-minimum');

const unavailable = () =>
  new ApiProblem(
    HttpStatus.CONFLICT,
    'Ce pseudonyme n’est pas disponible. Essayez une variante.',
    'pseudonyme-indisponible',
  );

const alreadyDone = () =>
  new ApiProblem(HttpStatus.CONFLICT, 'La première visite est déjà faite.', 'deja-fait');

const changedRecently = () =>
  new ApiProblem(
    HttpStatus.CONFLICT,
    `Le pseudonyme ne peut changer qu’une fois tous les ${HANDLE_CHANGE_DAYS} jours.`,
    'pseudonyme-change-recemment',
  );

const outdatedCharter = () =>
  new ApiProblem(
    HttpStatus.CONFLICT,
    'La charte a été mise à jour pendant votre lecture : relisez la nouvelle version.',
    'charte-perimee',
  );

const isUniqueViolation = (error: unknown) =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string } | undefined)?.code === '23505';

/** Une requête simultanée a modifié le compte : on recommence la décision sur l'état réel. */
class Conflict extends Error {}

@Injectable()
export class AccountService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private get users() {
    return this.db.getRepository(User);
  }

  /** Compte de l'application lié à cet identifiant Keycloak, créé à la première requête. */
  async ensure(keycloakId: string): Promise<User> {
    const existing = await this.users.findOneBy({ keycloakId });
    if (existing) return existing;
    // Deux premières requêtes simultanées : une seule ligne créée.
    await this.db.query(
      `INSERT INTO users (keycloak_id) VALUES ($1)
       ON CONFLICT (keycloak_id) WHERE keycloak_id IS NOT NULL DO NOTHING`,
      [keycloakId],
    );
    return this.users.findOneByOrFail({ keycloakId });
  }

  view(user: User): MyAccount {
    const changeable = user.handleChangedAt
      ? new Date(user.handleChangedAt.getTime() + HANDLE_CHANGE_DAYS * DAY)
      : null;
    return {
      step: accountStep(user),
      handle: user.handle,
      displayName: user.displayName,
      pronouns: user.pronouns,
      bio: user.bio,
      ageBand: user.ageBand === '15-17' || user.ageBand === '18+' ? user.ageBand : null,
      charterVersion: user.charterVersion,
      handleChangeableFrom: changeable && changeable > new Date() ? changeable.toISOString() : null,
    };
  }

  /** Pseudonyme libre : non réservé, non pris, non abandonné depuis moins de 90 jours. */
  async isAvailable(handle: string, manager: EntityManager = this.db.manager): Promise<boolean> {
    const key = handleKey(handle);
    if (isReservedName(handle)) return false;
    if (await manager.getRepository(User).existsBy({ handleKey: key })) return false;
    return !(await manager
      .getRepository(HandleRelease)
      .existsBy({ handleKey: key, reusableAt: MoreThan(new Date()) }));
  }

  async firstVisit(user: User, input: FirstVisit): Promise<User> {
    const step = accountStep(user);
    if (step === 'age-locked') throw ageLocked();
    if (step !== 'first-visit') throw alreadyDone();
    if (input.age === 'under-15') {
      // Seule la réponse est gardée (ni pseudonyme ni charte). Conditionnelle : une
      // réponse « 18+ » envoyée au même instant ne peut ni l'écraser ni être écrasée.
      const locked = await this.users.update(
        { id: user.id, ageBand: IsNull() },
        { ageBand: 'under-15' },
      );
      if (!locked.affected) return this.retry(user, input);
      throw ageLocked();
    }
    if (input.charterVersion !== CHARTER_VERSION) throw outdatedCharter();
    try {
      return await this.claimHandle(
        user,
        input.handle,
        { ageBand: IsNull() },
        {
          ageBand: input.age,
          charterVersion: CHARTER_VERSION,
          charterAcceptedAt: new Date(),
        },
      );
    } catch (error) {
      if (error instanceof Conflict) return this.retry(user, input);
      throw error;
    }
  }

  /** Après une requête simultanée : décider sur l'état réellement enregistré. */
  private async retry(user: User, input: FirstVisit): Promise<never> {
    const current = await this.users.findOneByOrFail({ id: user.id });
    if (accountStep(current) === 'age-locked') throw ageLocked();
    if (accountStep(current) !== 'first-visit') throw alreadyDone();
    throw new Error(`Première visite impossible à enregistrer (${input.age})`);
  }

  async acceptCharter(user: User, version: string): Promise<User> {
    if (version !== CHARTER_VERSION) throw outdatedCharter();
    await this.users.update(user.id, {
      charterVersion: CHARTER_VERSION,
      charterAcceptedAt: new Date(),
    });
    return this.users.findOneByOrFail({ id: user.id });
  }

  async changeHandle(user: User, handle: string): Promise<User> {
    const key = handleKey(handle);
    // Même pseudonyme à la casse ou aux accents près : simple retouche, sans délai.
    if (key === user.handleKey) {
      await this.users.update({ id: user.id, handleKey: key }, { handle });
      return this.users.findOneByOrFail({ id: user.id });
    }
    const since = user.handleChangedAt ? Date.now() - user.handleChangedAt.getTime() : Infinity;
    if (since < HANDLE_CHANGE_DAYS * DAY) throw changedRecently();
    try {
      // Conditionnelle sur l'ancien pseudonyme : deux changements simultanés n'en font qu'un.
      return await this.claimHandle(
        user,
        handle,
        { handleKey: user.handleKey ?? IsNull() },
        { handleChangedAt: new Date() },
      );
    } catch (error) {
      if (error instanceof Conflict) throw changedRecently();
      throw error;
    }
  }

  async updateProfile(user: User, input: UpdateProfile): Promise<User> {
    if (input.displayName && isReservedName(input.displayName)) {
      throw new ApiProblem(
        HttpStatus.CONFLICT,
        'Ce nom pourrait faire croire à un message de l’équipe : choisissez-en un autre.',
        'nom-reserve',
      );
    }
    const changes = Object.fromEntries(
      Object.entries(input)
        .filter(([, value]) => value !== undefined)
        .map(([field, value]) => [field, value === '' ? null : value]),
    );
    if (Object.keys(changes).length) await this.users.update(user.id, changes);
    return this.users.findOneByOrFail({ id: user.id });
  }

  async publicProfile(handle: string): Promise<PublicProfile | null> {
    const user = await this.users.findOneBy({ handleKey: handleKey(handle), status: 'active' });
    if (
      !user?.handle ||
      accountStep(user) === 'age-locked' ||
      accountStep(user) === 'first-visit'
    ) {
      return null;
    }
    return {
      handle: user.handle,
      displayName: user.displayName,
      pronouns: user.pronouns,
      bio: user.bio,
    };
  }

  /**
   * Attribue un pseudonyme (et d'autres champs) dans une transaction, seulement si le compte
   * est encore dans l'état attendu (`expected`) ; sinon Conflict. L'ancien pseudonyme est
   * bloqué 90 jours pour tout le monde (sans lien) et gardé un an pour la modération.
   */
  private async claimHandle(
    user: User,
    handle: string,
    expected: Record<string, unknown>,
    extra: Partial<User>,
  ): Promise<User> {
    try {
      await this.db.transaction(async (tx) => {
        if (!(await this.isAvailable(handle, tx))) throw unavailable();
        const updated = await tx
          .getRepository(User)
          .update({ id: user.id, ...expected }, { ...extra, handle, handleKey: handleKey(handle) });
        if (!updated.affected) throw new Conflict();
        if (user.handle && user.handleKey) {
          const now = Date.now();
          await tx
            .createQueryBuilder()
            .insert()
            .into(HandleRelease)
            .values({
              handleKey: user.handleKey,
              reusableAt: new Date(now + HANDLE_RELEASE_DAYS * DAY),
            })
            .orUpdate(['reusable_at'], ['handle_key'])
            .execute();
          await tx.getRepository(HandleHistory).insert({
            user: { id: user.id },
            handle: user.handle,
            handleKey: user.handleKey,
            usedUntil: new Date(now),
          });
        }
      });
    } catch (error) {
      // Deux personnes choisissent le même pseudonyme au même instant.
      if (isUniqueViolation(error)) throw unavailable();
      throw error;
    }
    return this.users.findOneByOrFail({ id: user.id });
  }
}
