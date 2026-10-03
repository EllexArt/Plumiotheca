import { TagKind } from '@plumiotheca/contracts';
import { Check, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { CreatedAt, IdColumn } from '../database/columns.js';

/**
 * Tag libre ou avertissement facultatif. Les synonymes pointent vers leur tag canonique
 * (la recherche porte toujours sur celui-ci) ; un sous-tag hérite de son parent.
 */
@Entity('tags')
@Check('tags_not_own_canonical', `"canonical_id" <> "id"`)
@Check('tags_not_own_parent', `"parent_id" <> "id"`)
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
  @Index()
  @ManyToOne(() => Tag, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  canonical!: Tag | null;

  @Index()
  @ManyToOne(() => Tag, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn()
  parent!: Tag | null;

  @CreatedAt()
  createdAt!: Date;
}
