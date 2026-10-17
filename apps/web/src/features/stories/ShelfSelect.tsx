import { Shelf } from '@plumiotheca/contracts';
import { useId } from 'react';
import { Alert } from '../../shared/ui/Feedback';
import fieldStyles from '../../shared/ui/Field.module.css';
import { shelfLabel, useSetShelf } from './library';
import styles from './Reading.module.css';

/**
 * Étagère d’une histoire dans Mes lectures (#30) : liste déroulante native (clavier et
 * lecteurs d’écran sans effort) ; le résultat est annoncé.
 */
export function ShelfSelect({
  storyId,
  shelf,
  label = 'Dans Mes lectures',
}: {
  storyId: string;
  shelf: Shelf | null;
  label?: string;
}) {
  const id = useId();
  const set = useSetShelf(storyId);
  return (
    <div className={styles.shelfSelect}>
      <label htmlFor={id} className={fieldStyles.label}>
        {label}
      </label>
      <select
        id={id}
        className={fieldStyles.input}
        value={shelf ?? ''}
        onChange={(e) => set.mutate(e.target.value ? (e.target.value as Shelf) : null)}
      >
        <option value="">Pas dans Mes lectures</option>
        {Shelf.options.map((s) => (
          <option key={s} value={s}>
            {shelfLabel[s]}
          </option>
        ))}
      </select>
      {/* Toujours présente : une zone annoncée doit exister avant que son contenu change. */}
      <output className={styles.meta}>
        {set.isSuccess &&
          (set.data.entry
            ? `Rangée : ${shelfLabel[set.data.entry.shelf]}.`
            : 'Retirée de Mes lectures.')}
      </output>
      {set.isError && (
        <Alert tone="danger" live title="Le rangement n’a pas été enregistré.">
          <p>{set.error.message}</p>
        </Alert>
      )}
    </div>
  );
}
