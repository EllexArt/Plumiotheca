import type { JSONContent } from '@tiptap/react';

/**
 * Copie de secours locale du brouillon en cours (onglet fermé, coupure réseau). Elle reste
 * dans ce navigateur seulement, et disparaît après un enregistrement réussi ou à la
 * déconnexion (appareil partagé).
 */
export interface Backup {
  version: number;
  doc: JSONContent;
  at: string;
}

const PREFIX = 'plumiotheca.brouillon.';

export function readBackup(chapterId: string): Backup | null {
  try {
    const raw = localStorage.getItem(PREFIX + chapterId);
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

export function writeBackup(chapterId: string, backup: Backup | null) {
  try {
    if (backup) localStorage.setItem(PREFIX + chapterId, JSON.stringify(backup));
    else localStorage.removeItem(PREFIX + chapterId);
  } catch {
    // Stockage plein ou indisponible : la sauvegarde serveur reste la référence.
  }
}

/** À la déconnexion : aucune copie de texte ne reste sur l'appareil. */
export function clearBackups() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}
