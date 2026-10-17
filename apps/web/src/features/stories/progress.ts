/**
 * Ancien historique de lecture gardé sur l'appareil (décision 54, avant #30) : la position
 * de lecture est maintenant sur le compte, dans « Mes lectures ». Ce qui reste sur un
 * appareil est effacé (au démarrage, à la déconnexion).
 */
const KEY = 'plumiotheca.lectures';
/** Format encore plus ancien (une clé par histoire). */
const LEGACY_PREFIX = 'plumiotheca.lecture.';

export function forgetReadings() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key === KEY || key.startsWith(LEGACY_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Rien à effacer.
  }
}
