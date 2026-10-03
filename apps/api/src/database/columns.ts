import { CreateDateColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Clé primaire UUID v7 (ordonnée dans le temps), générée par PostgreSQL 18. */
export const IdColumn = () => PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' });

export const CreatedAt = () => CreateDateColumn({ type: 'timestamptz' });
export const UpdatedAt = () => UpdateDateColumn({ type: 'timestamptz' });
