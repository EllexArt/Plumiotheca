import {
  DEFAULT_READING,
  READING_SIZE_MAX,
  READING_SIZE_MIN,
  ReadingFont,
  ReadingLineHeight,
  ReadingWidth,
  type ReadingPreferences,
} from '@plumiotheca/contracts';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { Alert } from '../../shared/ui/Feedback';
import { RadioGroup } from '../../shared/ui/Field';
import styles from './Reading.module.css';

interface Choice<V extends string> {
  value: V;
  label: string;
  hint?: string;
}

const FONTS = [
  {
    value: 'lecture',
    label: 'Avec empattements',
    hint: 'Literata, pensée pour la lecture longue.',
  },
  { value: 'sans', label: 'Sans empattements', hint: 'Figtree, aux formes simples.' },
] satisfies Choice<ReadingFont>[];

const LINE_HEIGHTS = [
  { value: 'serre', label: 'Serré' },
  { value: 'normal', label: 'Normal' },
  { value: 'aere', label: 'Aéré' },
] satisfies Choice<ReadingLineHeight>[];

const WIDTHS = [
  { value: 'etroite', label: 'Étroite' },
  { value: 'normale', label: 'Normale' },
  { value: 'large', label: 'Large' },
] satisfies Choice<ReadingWidth>[];

/**
 * Réglages de lecture (#28), dans une fenêtre : chaque choix s'applique aussitôt au
 * chapitre derrière. Les couleurs suivent le thème (et bientôt les ambiances, #77).
 */
export function ReadingSettings({
  preferences,
  onChange,
  onAccount,
  saveFailed,
}: {
  preferences: ReadingPreferences;
  onChange: (next: ReadingPreferences | null) => void;
  onAccount: boolean;
  saveFailed: boolean;
}) {
  const set = (patch: Partial<ReadingPreferences>) => onChange({ ...preferences, ...patch });
  const size = preferences.size;
  const isDefault = JSON.stringify(preferences) === JSON.stringify(DEFAULT_READING);
  return (
    <Dialog
      title="Réglages de lecture"
      description={
        onAccount
          ? 'Gardés sur votre compte : vous les retrouvez sur vos autres appareils.'
          : 'Gardés sur cet appareil. Connectez-vous pour les retrouver partout.'
      }
      trigger={
        <Button variant="secondary" size="small">
          Réglages de lecture
        </Button>
      }
    >
      <div className={styles.settings}>
        <RadioGroup
          label="Police"
          name="police"
          choices={FONTS}
          checkedChoice={preferences.font}
          onChange={(e) => set({ font: e.target.value as ReadingFont })}
        />
        <fieldset className={styles.sizeField}>
          <legend>Taille du texte</legend>
          <div className={styles.sizeControls}>
            <Button
              variant="secondary"
              size="small"
              // aria-disabled plutôt que disabled : le focus reste sur le bouton à la limite.
              aria-disabled={size <= READING_SIZE_MIN}
              onClick={() => size > READING_SIZE_MIN && set({ size: size - 10 })}
            >
              Plus petit
            </Button>
            {/* Annoncé à chaque changement : le focus reste sur le bouton. */}
            <output aria-live="polite">{size} %</output>
            <Button
              variant="secondary"
              size="small"
              aria-disabled={size >= READING_SIZE_MAX}
              onClick={() => size < READING_SIZE_MAX && set({ size: size + 10 })}
            >
              Plus grand
            </Button>
          </div>
        </fieldset>
        <RadioGroup
          label="Interligne"
          name="interligne"
          choices={LINE_HEIGHTS}
          checkedChoice={preferences.lineHeight}
          onChange={(e) => set({ lineHeight: e.target.value as ReadingLineHeight })}
        />
        <RadioGroup
          label="Largeur des lignes"
          name="largeur"
          choices={WIDTHS}
          checkedChoice={preferences.width}
          onChange={(e) => set({ width: e.target.value as ReadingWidth })}
        />
        {saveFailed && (
          <Alert tone="danger" live title="Vos réglages n’ont pas pu être enregistrés.">
            <p>Ils restent appliqués ici ; réessayez plus tard.</p>
          </Alert>
        )}
        <div>
          <Button
            variant="secondary"
            size="small"
            aria-disabled={isDefault}
            onClick={() => !isDefault && onChange(null)}
          >
            Revenir aux réglages par défaut
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
