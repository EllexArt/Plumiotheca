/**
 * Dernière position de lecture de chaque histoire (bouton « Reprendre ») : chapitre et
 * paragraphe (#29), décision 54 : pour les personnes connectées seulement, sur cet appareil
 * seulement, jamais envoyée ; 50 histoires au plus ; effacée à toute fin de session
 * (déconnexion, expiration, compte verrouillé). La reprise synchronisée entre appareils
 * viendra avec « Mes lectures » (#30).
 */
const KEY = 'plumiotheca.lectures';
/** Ancien format (une clé par histoire), effacé avec le reste. */
const LEGACY_PREFIX = 'plumiotheca.lecture.';
export const MAX_READINGS = 50;

/** Histoire, chapitre et, s'il est connu, paragraphe (identifiant de bloc). */
type Reading = [storyId: string, chapterId: string, blockId?: string];

function read(): Reading[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter(
          (e): e is Reading =>
            Array.isArray(e) &&
            typeof e[0] === 'string' &&
            typeof e[1] === 'string' &&
            (e[2] === undefined || typeof e[2] === 'string'),
        )
      : [];
  } catch {
    return [];
  }
}

function save(entry: Reading) {
  const next = [entry, ...read().filter(([id]) => id !== entry[0])];
  try {
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX_READINGS)));
  } catch {
    // Stockage indisponible : pas de « Reprendre », rien d'autre.
  }
}

/**
 * Retient le chapitre ouvert ; la plus récente d'abord, les plus anciennes oubliées.
 * Rouvrir le même chapitre garde le paragraphe retenu.
 */
export function rememberChapter(storyId: string, chapterId: string) {
  const known = read().find(([id]) => id === storyId);
  save(known?.[1] === chapterId ? known : [storyId, chapterId]);
}

/** Retient le paragraphe lu (#29). */
export function rememberBlock(storyId: string, chapterId: string, blockId: string) {
  save([storyId, chapterId, blockId]);
}

export function lastChapter(storyId: string): string | null {
  return read().find(([id]) => id === storyId)?.[1] ?? null;
}

/** Dernier paragraphe lu dans le dernier chapitre ouvert ; null s'il n'est pas connu. */
export function lastBlock(storyId: string): string | null {
  return read().find(([id]) => id === storyId)?.[2] ?? null;
}

/** Fin de session (ou visite sans compte) : l'historique de lecture ne reste pas sur l'appareil. */
export function forgetReadings() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key === KEY || key.startsWith(LEGACY_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Rien à effacer.
  }
}
