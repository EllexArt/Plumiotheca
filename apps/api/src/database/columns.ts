import { CreateDateColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Clé primaire UUID v7 (ordonnée dans le temps), générée par PostgreSQL 18. */
export const IdColumn = () => PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' });

export const CreatedAt = () => CreateDateColumn({ type: 'timestamptz' });
/**
 * Date de dernière modification. `precision: 3` (milliseconde) pour une colonne qui sert de
 * curseur de pagination : la date JavaScript du curseur la reproduit alors exactement.
 */
export const UpdatedAt = (precision?: 3) =>
  UpdateDateColumn({ type: 'timestamptz', ...(precision ? { precision } : {}) });
