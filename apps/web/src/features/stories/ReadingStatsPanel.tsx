import { Link } from 'react-router';
import { Alert, Loading } from '../../shared/ui/Feedback';
import { Checkbox } from '../../shared/ui/Field';
import { useMyAccount } from '../account/api';
import { formatNumber, plural } from './labels';
import styles from './Reading.module.css';
import { formatMinutes, useReadingStats, useSetReadingStats } from './readingStats';

const monthName = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const monthLabel = (month: string) => monthName.format(new Date(`${month}-01T12:00:00`));

/**
 * Mon bilan (#34), en tête de Mes lectures : quelques chiffres, sans série, badge ni
 * objectif. Rien n'apparaît si la personne l'a désactivé.
 */
export function ReadingStatsSection() {
  const account = useMyAccount();
  const enabled = account.data?.readingStats ?? false;
  const stats = useReadingStats(enabled);
  if (!enabled) return null;
  const s = stats.data;
  return (
    <section aria-labelledby="bilan" className={styles.shelf}>
      <h2 id="bilan" className={styles.sectionTitle}>
        Mon bilan
      </h2>
      {stats.isPending ? (
        <Loading label="Chargement de votre bilan…" />
      ) : !s ? (
        <Alert tone="danger" title="Votre bilan n’a pas pu être chargé.">
          <p>{stats.error?.message}</p>
        </Alert>
      ) : (
        <>
          <dl className={styles.stats}>
            <div>
              <dt>Temps de lecture ce mois-ci</dt>
              <dd>{formatMinutes(s.minutesThisMonth)}</dd>
            </div>
            <div>
              <dt>Cette année</dt>
              <dd>{formatMinutes(s.minutesThisYear)}</dd>
            </div>
            <div>
              <dt>Histoires terminées</dt>
              <dd>{formatNumber(s.finished)}</dd>
            </div>
            <div>
              <dt>Chapitres lus</dt>
              <dd>{formatNumber(s.chaptersRead)}</dd>
            </div>
            <div>
              <dt>Mots lus</dt>
              <dd>{formatNumber(s.wordsRead)}</dd>
            </div>
          </dl>
          <p className={styles.meta}>
            {plural(s.reading, 'histoire en cours', 'histoires en cours')},{' '}
            {plural(s.toRead, 'à lire', 'à lire')}. Temps compté depuis le début :{' '}
            {formatMinutes(s.minutesTotal)}.
          </p>
          <details className={styles.limitsDetails}>
            <summary>Temps de lecture des douze derniers mois</summary>
            <table className={styles.statsTable}>
              <caption className="visually-hidden">
                Temps de lecture des douze derniers mois
              </caption>
              <thead>
                <tr>
                  <th scope="col">Mois</th>
                  <th scope="col">Temps</th>
                </tr>
              </thead>
              <tbody>
                {s.months.map((m) => (
                  <tr key={m.month}>
                    <th scope="row">{monthLabel(m.month)}</th>
                    <td>{m.minutes ? formatMinutes(m.minutes) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <p className={styles.meta}>
            Visible de vous seulement. <Link to="/compte#bilan-lecture">Désactiver mon bilan</Link>
          </p>
        </>
      )}
    </section>
  );
}

/** Réglage du compte : afficher le bilan (et mesurer le temps de lecture) ou non. */
export function ReadingStatsSetting() {
  const account = useMyAccount();
  const save = useSetReadingStats();
  if (!account.data) return null;
  const checked = save.isPending ? save.variables : account.data.readingStats;
  return (
    <>
      <Checkbox
        label="Afficher mon bilan de lecture dans Mes lectures"
        hint="Temps de lecture (compté par mois, pendant que vous lisez), histoires terminées, chapitres et mots lus. Visible de vous seulement. Le désactiver efface le temps déjà compté."
        name="bilan"
        checked={checked}
        onChange={(event) => save.mutate(event.target.checked)}
      />
      {save.isError && (
        <Alert tone="danger" live title="Votre choix n’a pas pu être enregistré.">
          <p>{save.error.message}</p>
        </Alert>
      )}
    </>
  );
}
