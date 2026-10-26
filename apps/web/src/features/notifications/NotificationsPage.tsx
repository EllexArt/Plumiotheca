import { EmailDigest, NOTIFICATION_DAYS } from '@plumiotheca/contracts';
import { Link } from 'react-router';
import { useMyAccount } from '../account/api';
import { Button } from '../../shared/ui/Button';
import { Alert, Loading, Tag } from '../../shared/ui/Feedback';
import { RadioGroup } from '../../shared/ui/Field';
import { LoadMoreFooter, useLoadMore } from '../../shared/ui/LoadMore';
import { Page } from '../../shared/ui/Page';
import { formatDate, plural } from '../stories/labels';
import styles from '../stories/Reading.module.css';
import { useMarkRead, useNotifications, useSetEmailDigest, useUnreadNotifications } from './api';

/**
 * Mes notifications (#33) : nouveaux chapitres des histoires de Mes lectures, la plus récente
 * d’abord. Ouvrir un chapitre marque sa notification comme lue.
 */
export function NotificationsPage() {
  const query = useNotifications();
  const unread = useUnreadNotifications();
  const markRead = useMarkRead();
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const { list, loadMore } = useLoadMore(
    items.map((n) => n.id),
    query,
  );
  const count = unread.data ?? 0;

  return (
    <Page
      title="Notifications"
      lead={`Les nouveaux chapitres des histoires de Mes lectures, quelle que soit leur étagère. Gardées ${NOTIFICATION_DAYS} jours, puis supprimées.`}
    >
      <div className={styles.hiddenNote}>
        {/* Toujours présente : une zone annoncée doit exister avant que son contenu change. */}
        <output className={styles.meta}>
          {unread.isSuccess &&
            (count
              ? plural(count, 'notification non lue', 'notifications non lues')
              : 'Tout est lu.')}
        </output>
        {/* Gardé après le clic (le focus y reste), tant qu’il y a des notifications. */}
        {items.length > 0 && (
          <Button
            variant="secondary"
            size="small"
            pending={markRead.isPending}
            onClick={() => markRead.mutate(undefined)}
          >
            Tout marquer comme lu
          </Button>
        )}
      </div>
      {query.isPending ? (
        <Loading label="Chargement des notifications…" />
      ) : query.isError && !query.data ? (
        <Alert tone="danger" live title="Vos notifications n’ont pas pu être chargées.">
          <p>{query.error.message}</p>
        </Alert>
      ) : items.length ? (
        <>
          <ul className={styles.notifications} aria-label="Mes notifications" ref={list}>
            {items.map((n) => (
              <li key={n.id} className={n.read ? undefined : styles.unread}>
                <p className={styles.meta}>
                  {!n.read && <Tag kind="neutral">Non lue</Tag>} Nouveau chapitre ·{' '}
                  {formatDate(n.createdAt)}
                </p>
                <p>
                  <Link
                    to={`/histoires/${n.story.id}/chapitres/${n.chapter.id}`}
                    data-focus={n.id}
                    onClick={() => !n.read && markRead.mutate(n.id)}
                  >
                    Chapitre {n.chapter.number}
                    {n.chapter.title && (
                      <>
                        {' '}
                        : <span lang={n.story.language}>{n.chapter.title}</span>
                      </>
                    )}
                  </Link>{' '}
                  de « <span lang={n.story.language}>{n.story.title}</span> »
                </p>
              </li>
            ))}
          </ul>
          <LoadMoreFooter
            query={query}
            onLoadMore={loadMore}
            label="Voir plus de notifications"
            errorTitle="Les notifications suivantes n’ont pas pu être chargées."
          />
        </>
      ) : (
        <p>
          Aucune notification pour l’instant. Rangez une histoire dans{' '}
          <Link to="/mes-lectures">Mes lectures</Link> : ses nouveaux chapitres s’afficheront ici.
        </p>
      )}
      <section aria-labelledby="recapitulatif" className={styles.shelf}>
        <h2 id="recapitulatif" className={styles.sectionTitle}>
          E-mail récapitulatif
        </h2>
        <EmailDigestPanel />
      </section>
    </Page>
  );
}

const DIGEST_LABELS: Record<EmailDigest, string> = {
  never: 'Jamais (notifications sur le site seulement)',
  daily: 'Chaque jour, s’il y a du nouveau',
  weekly: 'Chaque semaine, s’il y a du nouveau',
};

/** Fréquence de l’e-mail récapitulatif ; enregistrée aussitôt. */
export function EmailDigestPanel() {
  const account = useMyAccount();
  const save = useSetEmailDigest();
  if (!account.data) return null;
  return (
    <>
      <RadioGroup
        label="Recevoir un e-mail récapitulatif"
        name="recapitulatif"
        hint="L’envoi des e-mails n’est pas encore ouvert : votre choix sera appliqué dès qu’il le sera. Chaque e-mail permettra de se désabonner en un clic."
        checkedChoice={save.isPending ? save.variables : account.data.emailDigest}
        choices={EmailDigest.options.map((value) => ({ value, label: DIGEST_LABELS[value] }))}
        onChange={(event) => {
          const value = EmailDigest.safeParse(event.target.value);
          if (value.success) save.mutate(value.data);
        }}
      />
      {save.isError && (
        <Alert tone="danger" live title="Votre choix n’a pas pu être enregistré.">
          <p>{save.error.message}</p>
        </Alert>
      )}
    </>
  );
}
