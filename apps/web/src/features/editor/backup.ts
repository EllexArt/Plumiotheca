import type { JSONContent } from '@tiptap/react';

/**
 * Copie de secours du brouillon en cours (coupure réseau, rechargement de la page). Elle
 * reste dans la session de l'onglet seulement (sessionStorage, décision 51) : jamais
 * envoyée, effacée après un enregistrement réussi, à la déconnexion et à la fermeture de
 * l'onglet.
 */
export interface Backup {
  version: number;
  doc: JSONContent;
  at: string;
}

const PREFIX = 'plumiotheca.brouillon.';

export function readBackup(chapterId: string): Backup | null {
  try {
    const raw = sessionStorage.getItem(PREFIX + chapterId);
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

export function writeBackup(chapterId: string, backup: Backup | null) {
  try {
    if (backup) sessionStorage.setItem(PREFIX + chapterId, JSON.stringify(backup));
    else sessionStorage.removeItem(PREFIX + chapterId);
  } catch {
    // Stockage plein ou indisponible : la sauvegarde serveur reste la référence.
  }
}

/** À la déconnexion : aucune copie de texte ne reste sur l'appareil. */
export function clearBackups() {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}
