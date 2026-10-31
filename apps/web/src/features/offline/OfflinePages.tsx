import type { StoryDetail } from '@plumiotheca/contracts';
import { useRef, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import { Link } from 'react-router';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { Alert, Loading } from '../../shared/ui/Feedback';
import { Page } from '../../shared/ui/Page';
import { formatDate, plural } from '../stories/labels';
import styles from '../stories/Reading.module.css';
import {
  formatBytes,
  useDownload,
  useDownloads,
  useDownloadStory,
  useRemoveDownload,
} from './downloads';

/**
 * Sur la fiche d'une histoire (#35) : la télécharger pour la lire hors ligne (avec un
 * compte), la mettre à jour ou la supprimer de l'appareil.
 */
export function DownloadPanel({ story }: { story: StoryDetail }) {
  const signedIn = useAuth().isAuthenticated;
  const download = useDownload(story.id);
  const save = useDownloadStory(story.id);
  const remove = useRemoveDownload();
  const saved = download.data;
  const published = story.chapters.filter((c) => c.status === 'published').length;
  if (!published || download.isPending || (!saved && !signedIn)) return null;
  // Chapitres ajoutés ou modifiés depuis le téléchargement.
  const outdated = saved && saved.story.updatedAt !== story.updatedAt;

  return (
    <div className={styles.download}>
      {/* Zone annoncée toujours présente : progression, fin du téléchargement. */}
      <output className={styles.meta}>
        {save.progress
          ? `Téléchargement : ${save.progress.done} sur ${plural(save.progress.total, 'chapitre')}…`
          : saved
            ? `Sur cet appareil depuis le ${formatDate(saved.savedAt)} (${formatBytes(saved.bytes)}), lisible hors ligne.${outdated ? ' Une version plus récente existe.' : ''}`
            : ''}
      </output>
      {signedIn && (
        <Button
          variant="secondary"
          size="small"
          pending={save.isPending}
          onClick={() => save.mutate()}
        >
          {saved ? 'Mettre à jour la copie' : 'Télécharger pour lire hors ligne'}
        </Button>
      )}
      {saved && (
        <Button
          variant="ghost"
          size="small"
          pending={remove.isPending}
          onClick={() => remove.mutate(story.id)}
        >
          Supprimer de l’appareil
        </Button>
      )}
      {save.isError && (
        <Alert tone="danger" live title="L’histoire n’a pas pu être téléchargée.">
          <p>{save.error.message}</p>
        </Alert>
      )}
    </div>
  );
}

/**
 * Sur cet appareil (#35) : les histoires téléchargées, lisibles sans connexion, même
 * déconnecté. Page publique : elle doit s'ouvrir en mode avion.
 */
export function OnThisDevicePage() {
  const downloads = useDownloads();
  const remove = useRemoveDownload();
  const [confirming, setConfirming] = useState(false);
  const heading = useRef<HTMLParagraphElement>(null);
  const items = downloads.data ?? [];
  const total = items.reduce((sum, d) => sum + d.bytes, 0);
  // Après une suppression : le compteur, ou le contenu principal s'il ne reste rien (le
  // bouton cliqué a disparu avec son histoire).
  const refocus = (left: number) =>
    left ? heading.current?.focus() : document.getElementById('contenu')?.focus();

  return (
    <Page
      title="Sur cet appareil"
      lead="Les histoires téléchargées se lisent sans connexion. Elles restent sur cet appareil, même après la déconnexion : toute personne qui utilise ce navigateur peut les voir."
    >
      {downloads.isPending ? (
        <Loading label="Lecture de l’appareil…" />
      ) : downloads.isError ? (
        <Alert tone="danger" title="Cet appareil ne permet pas de garder des histoires.">
          <p>Le stockage du navigateur est indisponible (navigation privée, peut-être).</p>
        </Alert>
      ) : items.length ? (
        <>
          <p className={styles.meta} ref={heading} tabIndex={-1}>
            {plural(items.length, 'histoire')}, {formatBytes(total)} en tout.
          </p>
          <ul className={styles.notifications} aria-label="Histoires téléchargées">
            {items.map(({ story, savedAt, bytes }) => {
              const first = story.chapters.find((c) => c.status === 'published');
              return (
                <li key={story.id}>
                  <p>
                    <Link to={`/histoires/${story.id}`} lang={story.language}>
                      {story.title}
                    </Link>
                  </p>
                  <p className={styles.meta}>
                    {plural(
                      story.chapters.filter((c) => c.status === 'published').length,
                      'chapitre',
                    )}{' '}
                    · {formatBytes(bytes)} · téléchargée le {formatDate(savedAt)}
                  </p>
                  <p className={styles.libraryActions}>
                    {first && (
                      <ButtonLink
                        to={`/histoires/${story.id}/chapitres/${first.id}`}
                        variant="secondary"
                        size="small"
                      >
                        Lire <span className="visually-hidden">« {story.title} »</span>
                      </ButtonLink>
                    )}
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() =>
                        remove.mutate(story.id, { onSuccess: () => refocus(items.length - 1) })
                      }
                    >
                      Supprimer <span className="visually-hidden">« {story.title} »</span> de
                      l’appareil
                    </Button>
                  </p>
                </li>
              );
            })}
          </ul>
          <div>
            <Button variant="secondary" onClick={() => setConfirming(true)}>
              Tout supprimer de l’appareil
            </Button>
          </div>
          <Dialog
            open={confirming}
            onOpenChange={setConfirming}
            title="Supprimer toutes les histoires téléchargées ?"
            description="Elles ne seront plus lisibles hors ligne sur cet appareil. Vous pourrez les télécharger de nouveau."
            footer={
              <>
                <Button variant="secondary" onClick={() => setConfirming(false)}>
                  Annuler
                </Button>
                <Button
                  variant="primary"
                  pending={remove.isPending}
                  onClick={() =>
                    remove.mutate(undefined, {
                      onSuccess: () => {
                        setConfirming(false);
                        // La liste (et cette fenêtre) disparaissent : focus sur le contenu.
                        requestAnimationFrame(() => refocus(0));
                      },
                    })
                  }
                >
                  Tout supprimer
                </Button>
              </>
            }
          >
            <p>
              {plural(items.length, 'histoire')}, {formatBytes(total)}.
            </p>
          </Dialog>
        </>
      ) : (
        <p>
          Aucune histoire téléchargée. Sur la fiche d’une histoire, choisissez « Télécharger pour
          lire hors ligne » (il faut être connecté).
        </p>
      )}
    </Page>
  );
}
