import type { ReactNode } from 'react';
import styles from './Feedback.module.css';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const icons: Record<Tone, ReactNode> = {
  info: <path d="M12 11v5M12 8h.01" />,
  success: <path d="M7 12.5l3.5 3.5L17 9" />,
  warning: <path d="M12 8v5M12 16h.01" />,
  danger: <path d="M9 9l6 6M15 9l-6 6" />,
};

/**
 * Message mis en avant. Le ton se lit aussi dans l'icône et le titre, jamais par la seule
 * couleur. `live` : annoncé dès qu'il apparaît (erreur après envoi d'un formulaire).
 */
export function Alert({
  tone = 'info',
  title,
  children,
  live = false,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  live?: boolean;
}) {
  const role = live ? (tone === 'danger' ? 'alert' : 'status') : undefined;
  return (
    <div className={`${styles.alert} ${styles[tone]}`} role={role}>
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9.5" />
        {icons[tone]}
      </svg>
      <div className={styles.alertBody}>
        {title && <p className={styles.alertTitle}>{title}</p>}
        {children}
      </div>
    </div>
  );
}

/** Chargement en cours, annoncé aux lecteurs d'écran. */
export function Loading({ label = 'Chargement…' }: { label?: string }) {
  return (
    <output className={styles.loading}>
      <span className={styles.spinner} aria-hidden="true" />
      {label}
    </output>
  );
}

type TagKind = 'neutral' | 'outline' | 'rating' | 'warning';
const tagClass: Record<TagKind, string | undefined> = {
  neutral: styles.tagNeutral,
  outline: styles.tagOutline,
  rating: styles.tagRating,
  warning: styles.tagWarning,
};

/** Étiquette (classement, tag, avertissement). */
export function Tag({ kind = 'outline', children }: { kind?: TagKind; children: ReactNode }) {
  return <span className={`${styles.tag} ${tagClass[kind]}`}>{children}</span>;
}
