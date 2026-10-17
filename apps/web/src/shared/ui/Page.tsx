import { useEffect, type ReactNode } from 'react';
import styles from './Page.module.css';

/** Titre de l'onglet, propre à chaque page (RGAA 8.6) : « Bienvenue — Plumiotheca ». */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} — Plumiotheca` : 'Plumiotheca';
  }, [title]);
}

/**
 * Page standard : un seul titre de niveau 1, repris dans le titre de l'onglet.
 */
export function Page({
  title,
  lead,
  width = 'wide',
  children,
  documentTitle,
}: {
  title: ReactNode;
  lead?: ReactNode;
  width?: 'wide' | 'narrow';
  children?: ReactNode;
  /** Titre de l'onglet quand le titre affiché n'est pas du texte simple. */
  documentTitle?: string;
}) {
  usePageTitle(documentTitle ?? (typeof title === 'string' ? title : ''));
  return (
    <div className={`${styles.page} ${styles[width]}`}>
      <div className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {lead && <p className={styles.lead}>{lead}</p>}
      </div>
      {children}
    </div>
  );
}
