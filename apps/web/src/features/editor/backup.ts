import type { JSONContent } from '@tiptap/react';

/**
 * Copies de secours du brouillon, dans la session de l'onglet seulement (sessionStorage,
 * décision 51) : jamais envoyées, effacées à la déconnexion et à la fermeture de l'onglet.
 *
 * - la copie **courante** suit la frappe et disparaît dès que le serveur a enregistré ;
 * - la copie **proposée** (texte non enregistré retrouvé au chargement, ou mis de côté après
 *   un conflit) est rangée à part : la frappe suivante ne l'écrase pas, elle reste jusqu'à
 *   « Reprendre » ou « L'ignorer ».
 */
export interface Backup {
  version: number;
  doc: JSONContent;
  at: string;
}

const PREFIX = 'plumiotheca.brouillon.';
const current = (chapterId: string) => PREFIX + chapterId;
const proposed = (chapterId: string) => `${PREFIX}${chapterId}.proposee`;

function read(key: string): Backup | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

function write(key: string, backup: Backup | null) {
  try {
    if (backup) sessionStorage.setItem(key, JSON.stringify(backup));
    else sessionStorage.removeItem(key);
  } catch {
    // Stockage plein ou indisponible : la sauvegarde serveur reste la référence.
  }
}

export const readBackup = (chapterId: string) => read(current(chapterId));
export const writeBackup = (chapterId: string, backup: Backup | null) =>
  write(current(chapterId), backup);
export const readProposed = (chapterId: string) => read(proposed(chapterId));
export const writeProposed = (chapterId: string, backup: Backup | null) =>
  write(proposed(chapterId), backup);

/** JSON à clés triées : deux documents identiques se comparent égaux quel que soit l'ordre. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const sameDocument = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/**
 * Copie à proposer au chargement : celle déjà proposée, sinon la copie courante si elle
 * diffère du brouillon enregistré (elle passe alors en « proposée », à l'abri de la frappe).
 * S'il y en a deux, la plus récente.
 */
export function backupToPropose(chapterId: string, saved: unknown): Backup | null {
  const kept = readProposed(chapterId);
  const found = readBackup(chapterId);
  const fresh = found && !sameDocument(found.doc, saved) ? found : null;
  const choice = kept && fresh ? (fresh.at > kept.at ? fresh : kept) : (kept ?? fresh);
  if (choice && sameDocument(choice.doc, saved)) {
    writeProposed(chapterId, null);
    return null;
  }
  if (choice) writeProposed(chapterId, choice);
  return choice;
}

/** À la déconnexion : aucune copie de texte ne reste dans l'onglet. */
export function clearBackups() {
  try {
    for (const key of Object.keys(sessionStorage)) {
      if (key.startsWith(PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // Stockage indisponible : rien à effacer.
  }
}
