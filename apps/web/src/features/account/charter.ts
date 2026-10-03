// Texte de la charte, lu depuis docs/charte.md au moment de la construction : la page
// affiche toujours la version du dépôt, celle que CHARTER_VERSION désigne.
import source from '../../../../../docs/charte.md?raw';

const [, ...rest] = source.split('\n');
/** Corps de la charte, sans son titre de premier niveau (la page a déjà le sien). */
export const charterBody = rest.join('\n');
