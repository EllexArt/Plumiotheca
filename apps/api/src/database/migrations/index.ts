// Migrations appliquées, dans l'ordre. Chaque migration générée doit être ajoutée ici
// (la CI échoue sinon : le schéma ne correspondrait plus aux entités).
import { ModeleInitial1791016512648 } from './1791016512648-ModeleInitial.js';
import { PremiereVisite1791018239120 } from './1791018239120-PremiereVisite.js';
import { HistoiresEtChapitres1791029268234 } from './1791029268234-HistoiresEtChapitres.js';

export const migrations = [
  ModeleInitial1791016512648,
  PremiereVisite1791018239120,
  HistoiresEtChapitres1791029268234,
];
