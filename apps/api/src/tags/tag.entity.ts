import { TagKind } from '@plumiotheca/contracts';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { CreatedAt, IdColumn } from '../database/columns.js';

/**
 * Tag libre ou avertissement facultatif. Les synonymes pointent vers leur tag canonique
 * (la recherche porte toujours sur celui-ci) ; un sous-tag hérite de son parent.
 */
@Entity('tags')
export class Tag {
  @IdColumn()
  id!: string;

  /** Libellé affiché, tel que saisi la première fois. */
  @Column({ type: 'varchar', length: 100 })
  name!: string;

  /** Forme normalisée (casse, accents, tirets, espaces) : un seul tag par forme. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  normalized!: string;

  @Column({ type: 'enum', enum: TagKind.options, enumName: 'tag_kind', default: 'freeform' })
  kind!: TagKind;

  /** Tag canonique dont celui-ci est un synonyme (NULL : il est lui-même canonique). */
  @ManyToOne(() => Tag, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  canonical!: Tag | null;

  @ManyToOne(() => Tag, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  parent!: Tag | null;

  @CreatedAt()
  createdAt!: Date;
}
