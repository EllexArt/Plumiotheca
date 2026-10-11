import { setNonce } from 'get-nonce';

/**
 * Nonce de la CSP (#140) : nginx en tire un nouveau à chaque réponse, l'écrit dans la balise
 * <meta name="csp-nonce"> de index.html et l'autorise dans `style-src`. Les bibliothèques
 * qui injectent une balise <style> (verrouillage du défilement des fenêtres de dialogue)
 * le lisent par `get-nonce`. En développement, la balise garde son marqueur : rien à faire.
 */
const nonce = document.querySelector<HTMLMetaElement>('meta[name="csp-nonce"]')?.content;
if (nonce && nonce !== '__CSP_NONCE__') setNonce(nonce);
