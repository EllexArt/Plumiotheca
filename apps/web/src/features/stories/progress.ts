/**
 * Dernier chapitre ouvert de chaque histoire (bouton « Reprendre »), décision 54 : pour les
 * personnes connectées seulement, sur cet appareil seulement, jamais envoyé ; 50 histoires
 * au plus ; effacé à toute fin de session (déconnexion, expiration, compte verrouillé). La
 * reprise synchronisée entre appareils, au paragraphe près, viendra avec « Mes lectures » (M2).
 */
const KEY = 'plumiotheca.lectures';
/** Ancien format (une clé par histoire), effacé avec le reste. */
const LEGACY_PREFIX = 'plumiotheca.lecture.';
export const MAX_READINGS = 50;

type Readings = [storyId: string, chapterId: string][];

function read(): Readings {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(value)
      ? value.filter(
          (e): e is [string, string] =>
            Array.isArray(e) && typeof e[0] === 'string' && typeof e[1] === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

/** Retient le chapitre ouvert ; la plus récente d'abord, les plus anciennes oubliées. */
export function rememberChapter(storyId: string, chapterId: string) {
  const next = [
    [storyId, chapterId] as [string, string],
    ...read().filter(([id]) => id !== storyId),
  ];
  try {
    localStorage.setItem(KEY, JSON.stringify(next.slice(0, MAX_READINGS)));
  } catch {
    // Stockage indisponible : pas de « Reprendre », rien d'autre.
  }
}

export function lastChapter(storyId: string): string | null {
  return read().find(([id]) => id === storyId)?.[1] ?? null;
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
