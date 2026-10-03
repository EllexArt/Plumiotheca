// Migrations appliquées, dans l'ordre. Chaque migration générée doit être ajoutée ici
// (la CI échoue sinon : le schéma ne correspondrait plus aux entités).
import { ModeleInitial1791016512648 } from './1791016512648-ModeleInitial.js';
import { PremiereVisite1791017105520 } from './1791017105520-PremiereVisite.js';

export const migrations = [ModeleInitial1791016512648, PremiereVisite1791017105520];
