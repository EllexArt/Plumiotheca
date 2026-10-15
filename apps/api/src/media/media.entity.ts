import { MediaKind, MediaRejection, MediaStatus } from '@plumiotheca/contracts';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne, type Relation } from 'typeorm';
import { CreatedAt, IdColumn } from '../database/columns.js';
import { User } from '../users/user.entity.js';

/**
 * Image téléversée par une personne (#18), de l'autorisation de téléverser jusqu'à l'image
 * traitée. Avatars et couvertures ne désignent qu'un média interne prêt, jamais une URL.
 * Supprimer le compte supprime ses médias ; le fichier public suit au rapprochement nocturne.
 */
@Entity('media')
@Index(['owner', 'createdAt'])
@Index(['status', 'createdAt'])
// Prête : dimensions connues et aucun refus ; refusée : une raison et pas de dimensions.
@Check(
  'media_status_consistent',
  `("status" = 'ready') = ("width" IS NOT NULL AND "height" IS NOT NULL)
   AND ("status" = 'rejected') = ("rejection" IS NOT NULL)`,
)
export class Media {
  @IdColumn()
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'owner_id' })
  owner!: Relation<User>;

  @Column({ type: 'uuid' })
  ownerId!: string;

  @Column({ type: 'enum', enum: MediaKind.options, enumName: 'media_kind' })
  kind!: MediaKind;

  @Column({ type: 'enum', enum: MediaStatus.options, enumName: 'media_status', default: 'pending' })
  status!: MediaStatus;

  @Column({
    type: 'enum',
    enum: MediaRejection.options,
    enumName: 'media_rejection',
    nullable: true,
  })
  rejection!: MediaRejection | null;

  @Column({ type: 'integer', nullable: true })
  width!: number | null;

  @Column({ type: 'integer', nullable: true })
  height!: number | null;

  @CreatedAt()
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt!: Date | null;
}
