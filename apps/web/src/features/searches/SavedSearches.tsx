import { MAX_SAVED_SEARCHES } from '@plumiotheca/contracts';
import { useRef, useState, type FormEvent } from 'react';
import { useAuth } from 'react-oidc-context';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { Alert, Loading } from '../../shared/ui/Feedback';
import { Checkbox, TextField } from '../../shared/ui/Field';
import styles from '../stories/Reading.module.css';
import {
  suggestedName,
  useRemoveSavedSearch,
  useSaveSearch,
  useSavedSearches,
  useUpdateSavedSearch,
} from './api';

/**
 * Explorer (#80) : enregistrer la recherche en cours (texte, tags, filtres), avec ou sans
 * alerte des nouvelles histoires. Seulement connecté, et quand il y a une recherche.
 */
export function SaveSearchButton() {
  const signedIn = useAuth().isAuthenticated;
  const [params] = useSearchParams();
  const save = useSaveSearch();
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState('');
  const query = params.toString();
  if (!signedIn || !query) return null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get('nom') ?? '').trim();
    if (!name) return;
    save.mutate(
      { name, query, alerts: form.get('alertes') === 'on' },
      {
        onSuccess: (search) => {
          setOpen(false);
          setSaved(`Recherche « ${search.name} » enregistrée.`);
        },
      },
    );
  };

  return (
    <div className={styles.hiddenNote}>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) save.reset();
        }}
        title="Enregistrer cette recherche"
        description="Elle se retrouve dans Mes lectures, avec ses filtres."
        trigger={
          <Button variant="secondary" size="small">
            Enregistrer cette recherche
          </Button>
        }
      >
        <form className={styles.settings} onSubmit={submit}>
          <TextField
            label="Nom de la recherche"
            name="nom"
            maxLength={100}
            required
            defaultValue={suggestedName(params)}
          />
          <Checkbox
            label="M’alerter des nouvelles histoires (au plus une fois par jour)"
            name="alertes"
            defaultChecked
          />
          {save.isError && (
            <Alert tone="danger" live title="La recherche n’a pas été enregistrée.">
              <p>{save.error.message}</p>
            </Alert>
          )}
          <div>
            <Button type="submit" variant="primary" pending={save.isPending}>
              Enregistrer
            </Button>
          </div>
        </form>
      </Dialog>
      {/* Zone annoncée toujours présente ; le lien mène aux recherches enregistrées. */}
      <output className={styles.meta}>
        {saved && (
          <>
            {saved} <Link to="/mes-lectures#recherches">Mes recherches</Link>
          </>
        )}
      </output>
    </div>
  );
}

/**
 * Mes recherches (#80), dans Mes lectures : rouvrir, alertes en un clic, supprimer.
 */
export function SavedSearchesSection() {
  const searches = useSavedSearches();
  const update = useUpdateSavedSearch();
  const remove = useRemoveSavedSearch();
  const heading = useRef<HTMLHeadingElement>(null);
  const items = searches.data ?? [];
  return (
    <section aria-labelledby="recherches" className={styles.shelf}>
      <h2 id="recherches" ref={heading} tabIndex={-1} className={styles.sectionTitle}>
        Mes recherches
      </h2>
      {searches.isPending ? (
        <Loading label="Chargement de vos recherches…" />
      ) : searches.isError ? (
        <Alert tone="danger" title="Vos recherches n’ont pas pu être chargées.">
          <p>{searches.error.message}</p>
        </Alert>
      ) : items.length ? (
        <>
          <ul className={styles.notifications} aria-label="Mes recherches enregistrées">
            {items.map((search) => (
              <li key={search.id}>
                <p>
                  <Link to={`/?${search.query}`}>{search.name}</Link>
                </p>
                <Checkbox
                  label={
                    <>
                      M’alerter des nouvelles histoires{' '}
                      <span className="visually-hidden">pour « {search.name} »</span>
                    </>
                  }
                  name={`alertes-${search.id}`}
                  checked={search.alerts}
                  onChange={(event) =>
                    update.mutate({ id: search.id, alerts: event.target.checked })
                  }
                />
                <div>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() =>
                      remove.mutate(search.id, {
                        // L'élément disparaît : focus sur le titre de la section.
                        onSuccess: () => heading.current?.focus(),
                      })
                    }
                  >
                    Supprimer <span className="visually-hidden">« {search.name} »</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <p className={styles.meta}>
            {MAX_SAVED_SEARCHES} recherches au plus. Une alerte groupée par jour et par recherche,
            dans vos notifications.
          </p>
        </>
      ) : (
        <p className={styles.meta}>
          Aucune recherche enregistrée. Dans Explorer, cherchez ou filtrez, puis « Enregistrer cette
          recherche ».
        </p>
      )}
      {(update.isError || remove.isError) && (
        <Alert tone="danger" live title="La modification n’a pas été faite.">
          <p>{(update.error ?? remove.error)?.message}</p>
        </Alert>
      )}
    </section>
  );
}
