/* eslint-disable jsx-a11y/prefer-tag-over-role -- motif « combobox » de l'APG ARIA : une liste
   de suggestions groupées (tags, histoires, personnes), que ni <datalist> ni <select> ne
   permettent ; le focus reste dans le champ (aria-activedescendant). */
import { Suggestions } from '@plumiotheca/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { useApi } from '../../shared/api/useApi';
import { Button } from '../../shared/ui/Button';
import { TextField } from '../../shared/ui/Field';
import { plural } from './labels';
import { useLimits } from './limits';
import styles from './Reading.module.css';
import { parseSearch, typing } from './searchSyntax';

/** Pause de frappe avant de demander des suggestions. */
const PAUSE_MS = 150;

/** Recherche lancée : texte, tags exclus dans la saisie, et tag choisi le cas échéant. */
export interface SearchInput {
  text: string;
  sans: string[];
  tag?: { name: string; exclude: boolean } | undefined;
}

type Option =
  | { kind: 'tag'; name: string; stories: number }
  | { kind: 'story'; id: string; title: string; language: string; by: string }
  | { kind: 'author'; handle: string; name: string };

/** Suggestions pour ce fragment (Mes limites appliquées : une histoire masquée n'est pas proposée). */
function useSuggestions(fragment: string, enabled: boolean) {
  const api = useApi();
  const { limits, pending } = useLimits();
  const [wanted, setWanted] = useState(fragment);
  useEffect(() => {
    const timer = setTimeout(() => setWanted(fragment), PAUSE_MS);
    return () => clearTimeout(timer);
  }, [fragment]);
  return useQuery({
    queryKey: ['suggestions', wanted, limits],
    enabled: enabled && wanted.length >= 2 && !pending,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ q: wanted });
      if (limits.hiddenMajorWarnings.length) {
        params.set('exclure', limits.hiddenMajorWarnings.join(','));
      }
      if (limits.hiddenContentWarnings.length) {
        params.set('exclureAutres', limits.hiddenContentWarnings.join(','));
      }
      if (limits.hiddenTags.length) params.set('masquerTags', limits.hiddenTags.join(','));
      return api(Suggestions, `/recherche/suggestions?${params}`, { signal });
    },
  });
}

/**
 * Barre de recherche intelligente (#31), sur le modèle « combobox » de l'ARIA : suggestions
 * groupées (tags, histoires, autrices et auteurs) pendant la frappe, flèches pour les
 * parcourir, Entrée pour choisir, Échap pour fermer. `-tag` exclut un tag.
 */
export function SmartSearch({
  initial,
  onSearch,
}: {
  initial: string;
  onSearch: (search: SearchInput) => void;
}) {
  const id = useId();
  const navigate = useNavigate();
  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const now = typing(value);
  // Seulement pendant la saisie : pas d'appel au chargement de la page.
  const suggestions = useSuggestions(now.fragment, open);
  const data = now.fragment.length >= 2 ? suggestions.data : undefined;

  const groups: { label: string; options: Option[] }[] = [
    {
      label: now.exclude ? 'Exclure le tag' : 'Tags',
      options: (data?.tags ?? []).map((t) => ({ kind: 'tag' as const, ...t })),
    },
    // Une exclusion en cours ne propose que des tags.
    ...(now.exclude
      ? []
      : [
          {
            label: 'Histoires',
            options: (data?.stories ?? []).map((s): Option => ({
              kind: 'story',
              id: s.id,
              title: s.title,
              language: s.language,
              by: s.author.displayName ?? `@${s.author.handle}`,
            })),
          },
          {
            label: 'Autrices et auteurs',
            options: (data?.authors ?? []).map((a): Option => ({
              kind: 'author',
              handle: a.handle,
              name: a.displayName ?? '',
            })),
          },
        ]),
  ].filter((group) => group.options.length);
  const options = groups.flatMap((group) => group.options);
  const expanded = open && options.length > 0;
  const optionId = (index: number) => `${id}-option-${index}`;

  const choose = (option: Option) => {
    setOpen(false);
    setActive(-1);
    if (option.kind === 'story') return void navigate(`/histoires/${option.id}`);
    if (option.kind === 'author') {
      return void navigate(`/profils/${encodeURIComponent(option.handle)}`);
    }
    const rest = parseSearch(now.rest);
    // Le fragment tapé devient le tag : il quitte la saisie.
    setValue(rest.text);
    onSearch({ ...rest, tag: { name: option.name, exclude: now.exclude } });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOpen(false);
    const parsed = parseSearch(value);
    // Les exclusions passent dans les filtres : la saisie garde le texte cherché.
    setValue(parsed.text);
    onSearch(parsed);
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return;
      event.preventDefault();
      setOpen(true);
      // Après la dernière option (ou avant la première) : retour au champ, aucune active.
      const last = options.length - 1;
      setActive((current) =>
        event.key === 'ArrowDown'
          ? current >= last
            ? -1
            : current + 1
          : current === -1
            ? last
            : current - 1,
      );
    } else if (event.key === 'Enter' && expanded && options[current]) {
      event.preventDefault();
      choose(options[current]);
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    }
  };
  // Liste changée sous le curseur (nouvelles suggestions) : plus d'option active.
  const current = active < options.length ? active : -1;

  let index = -1;
  return (
    <form role="search" className={styles.search} onSubmit={submit}>
      <div className={styles.combo}>
        <TextField
          label="Rechercher une histoire"
          name="q"
          type="search"
          hint="Titre, tag, nom de l’autrice ou de l’auteur, résumé. « -angst » exclut un tag."
          maxLength={200}
          autoComplete="off"
          value={value}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={`${id}-liste`}
          aria-activedescendant={expanded && current >= 0 ? optionId(current) : undefined}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={keyDown}
          onBlur={() => setOpen(false)}
          onFocus={() => setOpen(true)}
        />
        <div
          id={`${id}-liste`}
          role="listbox"
          aria-label="Suggestions"
          className={styles.suggestions}
          hidden={!expanded}
        >
          {groups.map((group, g) => (
            <div key={group.label} role="group" aria-labelledby={`${id}-groupe-${g}`}>
              <div id={`${id}-groupe-${g}`} role="presentation" className={styles.suggestionGroup}>
                {group.label}
              </div>
              {group.options.map((option) => {
                index += 1;
                const i = index;
                return (
                  // Option jamais focalisée : le clavier passe par le champ (flèches, Entrée).
                  // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
                  <div
                    key={i}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === current}
                    className={styles.suggestion}
                    // Choisi au clic sans quitter le champ (le blur fermerait la liste).
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                  >
                    <OptionText option={option} exclude={now.exclude} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {/* Nombre de suggestions annoncé, le focus restant dans le champ. */}
        <output className="visually-hidden">
          {open && data
            ? options.length
              ? plural(options.length, 'suggestion')
              : 'Aucune suggestion.'
            : ''}
        </output>
      </div>
      <div>
        <Button type="submit" variant="secondary">
          Rechercher
        </Button>
      </div>
    </form>
  );
}

function OptionText({ option, exclude }: { option: Option; exclude: boolean }) {
  switch (option.kind) {
    case 'tag':
      return (
        <>
          {exclude ? 'Sans' : 'Avec'} le tag « {option.name} »{' '}
          <span className={styles.meta}>({plural(option.stories, 'histoire')})</span>
        </>
      );
    case 'story':
      return (
        <>
          <span lang={option.language}>{option.title}</span>{' '}
          <span className={styles.meta}>par {option.by}</span>
        </>
      );
    case 'author':
      return (
        <>
          {option.name || `@${option.handle}`}
          {option.name && <span className={styles.meta}> @{option.handle}</span>}
        </>
      );
  }
}
