import { AccountStatus, DeclaredAge, DeletionMode } from '@plumiotheca/contracts';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { CreatedAt, IdColumn, UpdatedAt } from '../database/columns.js';
import { Media } from '../media/media.entity.js';

/**
 * Compte dans l'application. L'e-mail et le mot de passe restent dans Keycloak : la base
 * de l'application ne les connaît pas (minimisation, décision 29).
 *
 * Suppression du compte (décision 26) :
 * - « effacer » : la ligne est supprimée, ses contenus partent en cascade ;
 * - « anonymiser » : la ligne reste comme « compte supprimé » (statut `deleted`), toutes les
 *   colonnes personnelles remises à NULL, pour que les contributions gardées y restent liées.
 */
@Entity('users')
// Un compte actif est toujours lié à Keycloak ; un compte supprimé ne garde aucune donnée
// personnelle (liste tenue dans PERSONAL_FIELDS, vérifiée par les tests).
@Check('users_active_has_keycloak_id', `"status" = 'deleted' OR "keycloak_id" IS NOT NULL`)
// Un compte est daté et en cours de suppression seulement s'il est verrouillé (moins de
// 15 ans), et un compte verrouillé est toujours daté : supprimé 30 jours après.
@Check(
  'users_locked_has_date',
  `("age_band" IS NOT DISTINCT FROM 'under-15') = ("age_locked_at" IS NOT NULL)
    AND ("age_purge_started_at" IS NULL OR "age_locked_at" IS NOT NULL)`,
)
@Check(
  'users_deleted_is_empty',
  `"status" <> 'deleted' OR ("keycloak_id" IS NULL AND "handle" IS NULL AND "handle_key" IS NULL
    AND "display_name" IS NULL AND "pronouns" IS NULL AND "bio" IS NULL AND "age_band" IS NULL
    AND "charter_version" IS NULL AND "charter_accepted_at" IS NULL AND "age_locked_at" IS NULL
    AND "age_purge_started_at" IS NULL AND "avatar_media_id" IS NULL)`,
)
export class User {
  @IdColumn()
  id!: string;

  /** Identifiant Keycloak (claim « sub ») ; NULL une fois le compte anonymisé. Jamais public. */
  @Index({ unique: true, where: 'keycloak_id IS NOT NULL' })
  @Column({ type: 'uuid', nullable: true })
  keycloakId!: string | null;

  /** Pseudonyme public (@handle), choisi à la première visite. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  handle!: string | null;

  /** Forme normalisée du pseudonyme (casse, accents) : unicité sans sosies. */
  @Index({ unique: true, where: 'handle_key IS NOT NULL' })
  @Column({ type: 'varchar', length: 30, nullable: true })
  handleKey!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  displayName!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  pronouns!: string | null;

  @Column({ type: 'text', nullable: true })
  bio!: string | null;

  /**
   * Avatar (#26) : toujours une image interne prête, jamais une URL externe. Supprimer
   * l'image retire l'avatar.
   */
  @Column({ type: 'uuid', nullable: true })
  avatarMediaId!: string | null;

  @ManyToOne(() => Media, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'avatar_media_id' })
  avatarMedia?: Relation<Media> | null;

  /**
   * Âge déclaré à la première visite ; NULL tant qu'il n'est pas renseigné. « under-15 »
   * verrouille le compte (on ne recommence pas en changeant de réponse).
   */
  @Column({ type: 'enum', enum: DeclaredAge.options, enumName: 'age_band', nullable: true })
  ageBand!: DeclaredAge | null;

  /**
   * Date du verrouillage (réponse « moins de 15 ans ») : le compte est supprimé 30 jours
   * après (décision 45, #141). Personnelle : elle révèle la tranche d'âge.
   */
  @Column({ type: 'timestamptz', nullable: true })
  ageLockedAt!: Date | null;

  /**
   * Suppression commencée : compte Keycloak désactivé et déconnecté (première étape). La
   * suppression suit au passage suivant, quand plus aucun jeton émis avant n'est valide.
   */
  @Column({ type: 'timestamptz', nullable: true })
  agePurgeStartedAt!: Date | null;

  /** Version de la charte acceptée, et quand. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  charterVersion!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  charterAcceptedAt!: Date | null;

  /** Dernier changement de pseudonyme (un par mois au plus) ; NULL : jamais changé. */
  @Column({ type: 'timestamptz', nullable: true })
  handleChangedAt!: Date | null;

  @Column({
    type: 'enum',
    enum: AccountStatus.options,
    enumName: 'account_status',
    default: 'active',
  })
  status!: AccountStatus;

  /** Demande de suppression : exécutée sous 30 jours au plus. */
  @Column({ type: 'timestamptz', nullable: true })
  deletionRequestedAt!: Date | null;

  @Column({ type: 'enum', enum: DeletionMode.options, enumName: 'deletion_mode', nullable: true })
  deletionMode!: DeletionMode | null;

  @CreatedAt()
  createdAt!: Date;

  @UpdatedAt()
  updatedAt!: Date;
}

/**
 * Colonnes personnelles, vidées à l'anonymisation. Toute nouvelle colonne de `users` doit
 * être classée ici ou dans NON_PERSONAL_FIELDS (un test échoue sinon).
 */
export const PERSONAL_FIELDS = [
  'keycloakId',
  'handle',
  'handleKey',
  'displayName',
  'pronouns',
  'bio',
  'avatarMediaId',
  'ageBand',
  'ageLockedAt',
  'agePurgeStartedAt',
  'charterVersion',
  'charterAcceptedAt',
] as const satisfies readonly (keyof User)[];

export const NON_PERSONAL_FIELDS = [
  'id',
  'handleChangedAt',
  'status',
  'deletionRequestedAt',
  'deletionMode',
  'createdAt',
  'updatedAt',
] as const satisfies readonly (keyof User)[];

/** Valeurs d'un compte anonymisé (« compte supprimé »). */
export const anonymizedUser = (): Partial<User> => ({
  ...Object.fromEntries(PERSONAL_FIELDS.map((field) => [field, null])),
  status: 'deleted',
});
