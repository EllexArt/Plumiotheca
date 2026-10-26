import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Dernière réindexation demandée pour chaque histoire (#82). Une réindexation complète
 * rejoue, après l'échange d'index, celles demandées pendant qu'elle tournait : sans cela,
 * écrites dans l'index remplacé, elles seraient perdues jusqu'à la nuit suivante. Partagée
 * par tous les processus (API, ligne de commande), d'où une table plutôt qu'une mémoire.
 * Pas de clé étrangère : une histoire supprimée doit aussi être retirée de l'index.
 */
@Entity('search_syncs')
export class SearchSync {
  @PrimaryColumn({ type: 'uuid' })
  storyId!: string;

  @Column({ type: 'timestamptz', precision: 3 })
  syncedAt!: Date;
}
