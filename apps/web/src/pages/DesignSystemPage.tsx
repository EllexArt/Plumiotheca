import { Button, ButtonLink } from '../shared/ui/Button';
import { Dialog } from '../shared/ui/Dialog';
import { Alert, Loading, Tag } from '../shared/ui/Feedback';
import { Checkbox, RadioGroup, TextField } from '../shared/ui/Field';
import { Page } from '../shared/ui/Page';
import { useTheme } from '../app/theme';
import styles from './DesignSystemPage.module.css';

const colors = [
  ['page', 'Fond de page'],
  ['surface', 'Surface'],
  ['raised', 'Carte'],
  ['sunken', 'Creux'],
  ['text', 'Texte'],
  ['text-soft', 'Texte doux'],
  ['text-muted', 'Texte discret'],
  ['accent', 'Accent (liens)'],
  ['amber', 'Ambre'],
  ['primary', 'Principal'],
  ['success', 'Réussite'],
  ['warning', 'Attention'],
  ['danger', 'Erreur'],
  ['control-border', 'Contour des champs'],
];

/**
 * Système de design v1 (#20) : jetons et composants de base, en clair et en sombre.
 * Sert aussi de page de vérification (clavier, lecteur d'écran, zoom 200 %).
 */
export function DesignSystemPage() {
  const { choice, setChoice } = useTheme();
  return (
    <Page
      title="Système de design"
      lead="Identité « Lampe de chevet », palette Lueur. Chaque composant est utilisable au clavier et annoncé par les lecteurs d’écran ; les contrastes sont vérifiés automatiquement dans les deux thèmes."
    >
      <section className={styles.section} aria-labelledby="ds-theme">
        <h2 id="ds-theme">Thème</h2>
        <div className={styles.row}>
          <Button
            variant={choice === 'light' ? 'primary' : 'secondary'}
            aria-pressed={choice === 'light'}
            onClick={() => setChoice('light')}
          >
            Clair
          </Button>
          <Button
            variant={choice === 'dark' ? 'primary' : 'secondary'}
            aria-pressed={choice === 'dark'}
            onClick={() => setChoice('dark')}
          >
            Sombre
          </Button>
          <Button
            variant={choice === 'system' ? 'primary' : 'secondary'}
            aria-pressed={choice === 'system'}
            onClick={() => setChoice('system')}
          >
            Comme l’appareil
          </Button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="ds-couleurs">
        <h2 id="ds-couleurs">Couleurs</h2>
        <ul className={styles.swatches}>
          {colors.map(([token, label]) => (
            <li key={token} className={styles.swatch}>
              <span
                className={styles.chip}
                style={{ background: `var(--color-${token})` }}
                aria-hidden="true"
              />
              <span>
                {label}
                <code className={styles.code}>--color-{token}</code>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.section} aria-labelledby="ds-typo">
        <h2 id="ds-typo">Typographie</h2>
        <p className={styles.display}>Young Serif, pour les titres</p>
        <p className={styles.reading}>
          Literata, pour la lecture. La marée avait rendu les étagères une à une, ruisselantes,
          couvertes de sel. Ilse posa la main sur le dos d’un volume&#8239;: le cuir était tiède.
        </p>
        <p>Figtree, pour l’interface : boutons, menus, formulaires.</p>
      </section>

      <section className={styles.section} aria-labelledby="ds-boutons">
        <h2 id="ds-boutons">Boutons</h2>
        <div className={styles.row}>
          <Button variant="primary">Principal</Button>
          <Button variant="amber">Ambre</Button>
          <Button variant="secondary">Secondaire</Button>
          <Button variant="ghost">Discret</Button>
          <Button variant="danger">Supprimer</Button>
          <Button variant="secondary" disabled>
            Indisponible
          </Button>
          <Button variant="secondary" size="small">
            Petit
          </Button>
          <ButtonLink to="/charte" variant="secondary">
            Lien en bouton
          </ButtonLink>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="ds-champs">
        <h2 id="ds-champs">Champs</h2>
        <div className={styles.fields}>
          <TextField label="Titre de l’histoire" hint="200 caractères au maximum." required />
          <TextField
            label="Pseudonyme"
            defaultValue="ilse"
            error="Ce pseudonyme est déjà pris. Essayez une variante."
          />
          <TextField
            label="Pseudonyme"
            defaultValue="ilse.varenne"
            status="@ilse.varenne est disponible."
          />
          <RadioGroup
            label="Classement"
            name="ds-classement"
            choices={[
              { value: 'general', label: 'Tout public' },
              { value: 'teen', label: 'Ado' },
              {
                value: 'mature',
                label: 'Mature',
                hint: 'Sujets ou scènes réservés à un public averti.',
              },
            ]}
          />
          <Checkbox label="Histoire terminée" />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="ds-messages">
        <h2 id="ds-messages">Messages</h2>
        <Alert tone="info" title="Information">
          <p>Le chapitre 4 est un brouillon : seul·e vous le voyez.</p>
        </Alert>
        <Alert tone="success" title="Enregistré">
          <p>Votre brouillon est à jour.</p>
        </Alert>
        <Alert tone="warning" title="Attention">
          <p>Ce chapitre a été modifié dans un autre onglet.</p>
        </Alert>
        <Alert tone="danger" title="Erreur">
          <p>Le chapitre n’a pas pu être publié.</p>
        </Alert>
        <Loading />
      </section>

      <section className={styles.section} aria-labelledby="ds-etiquettes">
        <h2 id="ds-etiquettes">Étiquettes</h2>
        <div className={styles.row}>
          <Tag kind="rating">Tout public</Tag>
          <Tag kind="neutral">Ilse &amp; Tomas</Tag>
          <Tag>fantasy</Tag>
          <Tag kind="warning">Avertissements : deuil, noyade</Tag>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="ds-dialogue">
        <h2 id="ds-dialogue">Dialogue</h2>
        <Dialog
          title="Publier le chapitre ?"
          description="Les personnes abonnées à l’histoire seront prévenues."
          trigger={<Button variant="secondary">Ouvrir un dialogue</Button>}
          footer={<Button variant="primary">Publier</Button>}
        >
          <p>Le focus reste dans cette fenêtre ; Échap la ferme et rend le focus au bouton.</p>
        </Dialog>
      </section>
    </Page>
  );
}
