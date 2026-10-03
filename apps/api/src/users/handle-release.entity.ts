import { Column, Entity, PrimaryColumn } from 'typeorm';
import { CreatedAt } from '../database/columns.js';

/**
 * Pseudonyme abandonné (changement ou suppression de compte) : réattribuable seulement
 * après 90 jours, contre l'usurpation. Aucun lien vers l'ancien compte n'est conservé.
 */
@Entity('handle_releases')
export class HandleRelease {
  @PrimaryColumn({ type: 'varchar', length: 30 })
  handleKey!: string;

  @Column({ type: 'timestamptz' })
  reusableAt!: Date;

  @CreatedAt()
  releasedAt!: Date;
}
