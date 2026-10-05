/**
 * Dernier chapitre ouvert de chaque histoire, sur cet appareil seulement (bouton
 * « Reprendre »). Jamais envoyé ; effacé à la déconnexion. La reprise synchronisée entre
 * appareils, au paragraphe près, viendra avec « Mes lectures » (M2).
 */
const PREFIX = 'plumiotheca.lecture.';

export function rememberChapter(storyId: string, chapterId: string) {
  try {
    localStorage.setItem(PREFIX + storyId, chapterId);
  } catch {
    // Stockage indisponible : pas de « Reprendre », rien d'autre.
  }
}

export function lastChapter(storyId: string): string | null {
  try {
    return localStorage.getItem(PREFIX + storyId);
  } catch {
    return null;
  }
}

/** À la déconnexion : l'historique de lecture ne reste pas sur l'appareil. */
export function forgetReadings() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Rien à effacer.
  }
}
