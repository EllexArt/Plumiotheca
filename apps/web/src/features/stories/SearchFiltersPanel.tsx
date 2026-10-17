import { Completion, MajorWarning, normalizeTag, Rating } from '@plumiotheca/contracts';
import { Button } from '../../shared/ui/Button';
import { Checkbox, RadioGroup } from '../../shared/ui/Field';
import { LENGTHS, NO_FILTERS, SORT_LABELS, type LengthBucket, type SearchFilters } from './filters';
import { ratingLabel, warningLabel } from './labels';
import styles from './Reading.module.css';

/** Langues proposées ; les noms viennent du navigateur, en français. */
const LANGUAGES = ['fr', 'en', 'es', 'de', 'it'];
const languageName = new Intl.DisplayNames(['fr'], { type: 'language' });

const toggled = <T,>(list: T[], value: T, checked: boolean) =>
  checked ? [...list, value] : list.filter((v) => v !== value);

type TagState = 'inclus' | 'exclu' | 'ignoré';
const NEXT: Record<TagState, TagState> = { ignoré: 'inclus', inclus: 'exclu', exclu: 'ignoré' };
const MARK: Record<TagState, string> = { ignoré: '', inclus: '+ ', exclu: '− ' };

/**
 * Filtres d'Explorer et de la recherche (#32). Chaque choix s'applique aussitôt et va dans
 * l'adresse (partageable) ; le nombre de résultats est annoncé à côté.
 */
export function SearchFiltersPanel({
  filters,
  onChange,
  suggestedTags,
  searching,
}: {
  filters: SearchFilters;
  onChange: (next: SearchFilters) => void;
  /** Tags des histoires affichées, à inclure ou exclure en un toucher. */
  suggestedTags: string[];
  /** Recherche plein texte : le tri « Pertinence » est proposé (et l'est par défaut). */
  searching: boolean;
}) {
  const set = (patch: Partial<SearchFilters>) => onChange({ ...filters, ...patch });
  const key = (tag: string) => normalizeTag(tag);
  const stateOf = (tag: string): TagState =>
    filters.tags.some((t) => key(t) === key(tag))
      ? 'inclus'
      : filters.sans.some((t) => key(t) === key(tag))
        ? 'exclu'
        : 'ignoré';
  const cycle = (tag: string) => {
    const without = (list: string[]) => list.filter((t) => key(t) !== key(tag));
    const next = NEXT[stateOf(tag)];
    set({
      tags: next === 'inclus' ? [...without(filters.tags), tag] : without(filters.tags),
      sans: next === 'exclu' ? [...without(filters.sans), tag] : without(filters.sans),
    });
  };
  // Tags choisis d'abord (toujours modifiables), puis ceux des histoires affichées.
  const seen = new Set<string>();
  const tags = [...filters.tags, ...filters.sans, ...suggestedTags].filter((tag) => {
    if (seen.has(key(tag))) return false;
    seen.add(key(tag));
    return true;
  });
  const sorts = searching
    ? (['pertinence', 'recentes', 'mises_a_jour', 'lecteurs', 'longueur'] as const)
    : (['recentes', 'mises_a_jour', 'lecteurs', 'longueur'] as const);

  return (
    <div className={styles.limitsPanel}>
      <fieldset className={styles.limits}>
        <legend>Tags</legend>
        <p className={styles.meta}>
          Un toucher : avec ce tag (+), sans ce tag (−), puis indifférent.
        </p>
        {tags.length ? (
          <ul className={styles.tagList} aria-label="Tags à inclure ou exclure">
            {tags.slice(0, 30).map((tag) => {
              const state = stateOf(tag);
              return (
                <li key={key(tag)}>
                  <Button
                    variant={state === 'ignoré' ? 'ghost' : 'secondary'}
                    size="small"
                    onClick={() => cycle(tag)}
                  >
                    {/* Le signe est pour l'œil ; l'état est dit en toutes lettres. */}
                    <span aria-hidden="true">{MARK[state]}</span>
                    {tag} <span className="visually-hidden">: {state}</span>
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.meta}>Aucun tag parmi les histoires affichées.</p>
        )}
      </fieldset>
      <RadioGroup
        label="Statut"
        name="statut"
        checkedChoice={filters.statut ?? 'toutes'}
        choices={[
          { value: 'toutes', label: 'Toutes' },
          { value: 'completed', label: 'Terminées' },
          { value: 'in_progress', label: 'En cours' },
        ]}
        onChange={(e) => set({ statut: Completion.safeParse(e.target.value).data })}
      />
      <fieldset className={styles.limits}>
        <legend>Langues</legend>
        <div className={styles.limitsOptions}>
          {LANGUAGES.map((language) => (
            <Checkbox
              key={language}
              label={languageName.of(language) ?? language}
              name="langues"
              value={language}
              checked={filters.langues.includes(language)}
              onChange={(e) =>
                set({ langues: toggled(filters.langues, language, e.target.checked) })
              }
            />
          ))}
        </div>
      </fieldset>
      <RadioGroup
        label="Classement maximum"
        name="classementMax"
        checkedChoice={filters.classementMax ?? 'mature'}
        choices={Rating.options.map((rating) => ({
          value: rating,
          label: rating === 'mature' ? 'Mature (tout afficher)' : ratingLabel[rating],
        }))}
        onChange={(e) => {
          const rating = Rating.safeParse(e.target.value).data;
          set({ classementMax: rating === 'mature' ? undefined : rating });
        }}
      />
      <RadioGroup
        label="Longueur"
        name="longueur"
        checkedChoice={filters.longueur ?? 'toutes'}
        choices={[
          { value: 'toutes', label: 'Toutes' },
          ...Object.entries(LENGTHS).map(([value, { label }]) => ({ value, label })),
        ]}
        onChange={(e) =>
          set({
            longueur: e.target.value in LENGTHS ? (e.target.value as LengthBucket) : undefined,
          })
        }
      />
      <fieldset className={styles.limits}>
        <legend>Exclure les histoires qui portent…</legend>
        <p className={styles.meta}>
          Pour cette recherche. Pour toujours les masquer : « Masquer certains sujets ».
        </p>
        <div className={styles.limitsOptions}>
          {MajorWarning.options.map((warning) => (
            <Checkbox
              key={warning}
              label={warningLabel[warning]}
              name="exclure"
              value={warning}
              checked={filters.exclure.includes(warning)}
              onChange={(e) =>
                set({ exclure: toggled(filters.exclure, warning, e.target.checked) })
              }
            />
          ))}
        </div>
      </fieldset>
      <RadioGroup
        label="Trier par"
        name="tri"
        checkedChoice={
          filters.tri && (searching || filters.tri !== 'pertinence')
            ? filters.tri
            : searching
              ? 'pertinence'
              : 'recentes'
        }
        choices={sorts.map((sort) => ({ value: sort, label: SORT_LABELS[sort] }))}
        onChange={(e) => {
          const tri = e.target.value as (typeof sorts)[number];
          set({ tri: tri === (searching ? 'pertinence' : 'recentes') ? undefined : tri });
        }}
      />
      {/* Toujours là : un bouton qui disparaît au clic perdrait le focus. */}
      <div>
        <Button variant="secondary" onClick={() => onChange(NO_FILTERS)}>
          Réinitialiser les filtres
        </Button>
      </div>
    </div>
  );
}
