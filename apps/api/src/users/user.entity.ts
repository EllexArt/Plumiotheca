import { AccountStatus, AgeBand, DeletionMode } from '@plumiotheca/contracts';
import { Column, Entity, Index } from 'typeorm';
import { CreatedAt, IdColumn, UpdatedAt } from '../database/columns.js';

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

  /** Tranche déclarée (« 15-17 » ou « 18+ ») ; NULL tant qu'elle n'est pas renseignée. */
  @Column({ type: 'enum', enum: AgeBand.options, enumName: 'age_band', nullable: true })
  ageBand!: AgeBand | null;

  /** Version de la charte acceptée, et quand. */
  @Column({ type: 'varchar', length: 20, nullable: true })
  charterVersion!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  charterAcceptedAt!: Date | null;

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
