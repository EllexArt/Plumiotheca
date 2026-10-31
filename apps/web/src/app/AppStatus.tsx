import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { Button } from '../shared/ui/Button';
import { Alert } from '../shared/ui/Feedback';
import styles from './Layout.module.css';

const subscribeOnline = (listener: () => void) => {
  window.addEventListener('online', listener);
  window.addEventListener('offline', listener);
  return () => {
    window.removeEventListener('online', listener);
    window.removeEventListener('offline', listener);
  };
};

/** Le navigateur se dit-il connecté ? (true côté serveur et dans le doute.) */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Service worker (#35), en production seulement : l'interface reste disponible hors ligne.
 * Une nouvelle version est proposée, jamais imposée (on peut être en pleine lecture).
 */
function useServiceWorker() {
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    void import('virtual:pwa-register').then(({ registerSW }) => {
      if (cancelled) return;
      const reload = registerSW({
        onNeedRefresh: () => setUpdate(() => () => reload(true)),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return update;
}

/**
 * État de l'application, en tête du contenu : hors ligne, ou nouvelle version disponible.
 * Zone annoncée toujours présente (son contenu change, pas son existence).
 */
export function AppStatus() {
  const online = useOnline();
  const update = useServiceWorker();
  return (
    <output className={styles.banner}>
      {!online && (
        <Alert tone="warning" title="Vous êtes hors ligne.">
          <p>
            Les pages déjà ouvertes restent affichées, et les{' '}
            <Link to="/sur-cet-appareil">histoires téléchargées</Link> se lisent ; le reste revient
            avec le réseau.
          </p>
        </Alert>
      )}
      {update && (
        <Alert tone="info" title="Une nouvelle version de Plumiotheca est disponible.">
          <p>
            <Button variant="secondary" size="small" onClick={() => void update()}>
              Recharger la page
            </Button>
          </p>
        </Alert>
      )}
    </output>
  );
}
