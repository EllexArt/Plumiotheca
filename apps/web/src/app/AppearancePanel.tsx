import { Alert } from '../shared/ui/Feedback';
import { RadioGroup } from '../shared/ui/Field';
import { useAppearance } from './appearance';
import styles from './Appearance.module.css';
import { PALETTES, type PaletteId } from './palettes';
import type { ThemeChoice } from './theme';

/**
 * Aperçu d’une ambiance (#77) : ses couleurs de fond, de texte et d’accent, dans le mode en
 * cours (les jetons de l’ambiance s’appliquent à l’élément, via data-ambiance).
 */
export function Swatch({ palette }: { palette: PaletteId }) {
  return (
    <span className={styles.swatch} data-ambiance={palette} aria-hidden="true">
      <span className={styles.swatchText}>Aa</span>
      <span className={styles.swatchAccent} />
    </span>
  );
}

/** Choix d’ambiance, avec aperçu ; utilisé par les paramètres et par le lecteur. */
export const paletteChoices = PALETTES.map((p) => ({
  value: p.id,
  label: (
    <span className={styles.choice}>
      <Swatch palette={p.id} />
      {p.name}
    </span>
  ),
  hint: p.description,
}));

const MODES: { value: ThemeChoice; label: string }[] = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
  { value: 'system', label: 'Comme l’appareil' },
];

/** Apparence de tout le site (#77) : mode et ambiance, appliqués aussitôt. */
export function AppearancePanel() {
  const appearance = useAppearance();
  return (
    <div className={styles.panel}>
      <p className={styles.meta}>
        {appearance.onAccount
          ? 'Gardée sur votre compte : vous la retrouvez sur vos autres appareils.'
          : 'Gardée sur cet appareil.'}
      </p>
      <RadioGroup
        label="Mode"
        name="mode-site"
        hint="« Comme l’appareil » suit le réglage de votre ordinateur ou de votre téléphone."
        choices={MODES}
        checkedChoice={appearance.mode}
        onChange={(e) => appearance.change({ mode: e.target.value as ThemeChoice })}
      />
      <RadioGroup
        label="Ambiance"
        name="ambiance-site"
        choices={paletteChoices}
        checkedChoice={appearance.palette}
        onChange={(e) => appearance.change({ palette: e.target.value as PaletteId })}
      />
      {appearance.saveFailed && (
        <Alert
          tone="danger"
          live
          title="Votre apparence n’a pas pu être enregistrée sur le compte."
        >
          <p>Elle reste appliquée sur cet appareil ; réessayez plus tard.</p>
        </Alert>
      )}
    </div>
  );
}
