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
import { DataSource, type EntityManager, MoreThan, QueryFailedError } from 'typeorm';
import { ApiProblem } from '../common/problem.js';
import { HandleRelease } from '../users/handle-release.entity.js';
import { User } from '../users/user.entity.js';
import { accountStep } from './account-step.js';
import { isReservedHandle } from './reserved-handles.js';

const DAY = 24 * 60 * 60 * 1000;

const unavailable = () =>
  new ApiProblem(
    HttpStatus.CONFLICT,
    'Ce pseudonyme n’est pas disponible. Essayez une variante.',
    'pseudonyme-indisponible',
  );

const isUniqueViolation = (error: unknown) =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string } | undefined)?.code === '23505';

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

  /** Pseudonyme libre : valide, non réservé, non pris, non abandonné depuis moins de 90 jours. */
  async isAvailable(handle: string, manager: EntityManager = this.db.manager): Promise<boolean> {
    const key = handleKey(handle);
    if (isReservedHandle(key)) return false;
    if (await manager.getRepository(User).existsBy({ handleKey: key })) return false;
    return !(await manager
      .getRepository(HandleRelease)
      .existsBy({ handleKey: key, reusableAt: MoreThan(new Date()) }));
  }

  async firstVisit(user: User, input: FirstVisit): Promise<User> {
    const step = accountStep(user);
    if (step === 'age-locked') throw ageLocked();
    if (step !== 'first-visit') {
      throw new ApiProblem(HttpStatus.CONFLICT, 'La première visite est déjà faite.', 'deja-fait');
    }
    if (input.age === 'under-15') {
      // Seule la réponse est gardée (ni pseudonyme ni charte) : elle verrouille le compte.
      await this.users.update(user.id, { ageBand: 'under-15' });
      throw ageLocked();
    }
    if (input.charterVersion !== CHARTER_VERSION) throw outdatedCharter();
    return this.claimHandle(user, input.handle, {
      ageBand: input.age,
      charterVersion: CHARTER_VERSION,
      charterAcceptedAt: new Date(),
    });
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
      await this.users.update(user.id, { handle });
      return this.users.findOneByOrFail({ id: user.id });
    }
    if (
      user.handleChangedAt &&
      Date.now() - user.handleChangedAt.getTime() < HANDLE_CHANGE_DAYS * DAY
    ) {
      throw new ApiProblem(
        HttpStatus.CONFLICT,
        `Le pseudonyme ne peut changer qu’une fois tous les ${HANDLE_CHANGE_DAYS} jours.`,
        'pseudonyme-change-recemment',
      );
    }
    return this.claimHandle(user, handle, { handleChangedAt: new Date() });
  }

  async updateProfile(user: User, input: UpdateProfile): Promise<User> {
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
   * Attribue un pseudonyme (et d'autres champs) dans une transaction ; l'ancien est mis de
   * côté 90 jours, sans lien vers le compte.
   */
  private async claimHandle(user: User, handle: string, extra: Partial<User>): Promise<User> {
    try {
      await this.db.transaction(async (tx) => {
        if (!(await this.isAvailable(handle, tx))) throw unavailable();
        if (user.handleKey) {
          await tx
            .createQueryBuilder()
            .insert()
            .into(HandleRelease)
            .values({
              handleKey: user.handleKey,
              reusableAt: new Date(Date.now() + HANDLE_RELEASE_DAYS * DAY),
            })
            .orUpdate(['reusable_at'], ['handle_key'])
            .execute();
        }
        await tx
          .getRepository(User)
          .update(user.id, { ...extra, handle, handleKey: handleKey(handle) });
      });
    } catch (error) {
      // Deux personnes choisissent le même pseudonyme au même instant.
      if (isUniqueViolation(error)) throw unavailable();
      throw error;
    }
    return this.users.findOneByOrFail({ id: user.id });
  }
}

function ageLocked() {
  return new ApiProblem(
    HttpStatus.FORBIDDEN,
    'Plumiotheca est ouverte à partir de 15 ans : ce compte ne peut pas être utilisé. Tu pourras revenir avec un nouveau compte quand tu auras 15 ans.',
    'age-minimum',
  );
}

function outdatedCharter() {
  return new ApiProblem(
    HttpStatus.CONFLICT,
    'La charte a été mise à jour pendant votre lecture : relisez la nouvelle version.',
    'charte-perimee',
  );
}
