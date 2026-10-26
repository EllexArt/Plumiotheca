// Migrations appliquées, dans l'ordre. Chaque migration générée doit être ajoutée ici
// (la CI échoue sinon : le schéma ne correspondrait plus aux entités).
import { ModeleInitial1791016512648 } from './1791016512648-ModeleInitial.js';
import { PremiereVisite1791018239120 } from './1791018239120-PremiereVisite.js';
import { HistoiresEtChapitres1791029268234 } from './1791029268234-HistoiresEtChapitres.js';
import { AvertissementsFacultatifs1791201913977 } from './1791201913977-AvertissementsFacultatifs.js';
import { HorodatagesMilliseconde1791477431997 } from './1791477431997-HorodatagesMilliseconde.js';
import { Selections1792253380573 } from './1792253380573-Selections.js';
import { SaisieIntelligente1792254000000 } from './1792254000000-SaisieIntelligente.js';
import { Notifications1793021640920 } from './1793021640920-Notifications.js';
import { ReindexationsSuivies1793030000000 } from './1793030000000-ReindexationsSuivies.js';
import { MesLectures1792252868090 } from './1792252868090-MesLectures.js';
import { Apparence1792251152107 } from './1792251152107-Apparence.js';
import { Limites1792250556806 } from './1792250556806-Limites.js';
import { ReglagesLecture1792232124385 } from './1792232124385-ReglagesLecture.js';
import { Avatar1792101373024 } from './1792101373024-Avatar.js';
import { Medias1792100161436 } from './1792100161436-Medias.js';
import { ComptageLectures1792099476494 } from './1792099476494-ComptageLectures.js';
import { VerrouillageDate1791737688030 } from './1791737688030-VerrouillageDate.js';

export const migrations = [
  ModeleInitial1791016512648,
  PremiereVisite1791018239120,
  HistoiresEtChapitres1791029268234,
  AvertissementsFacultatifs1791201913977,
  HorodatagesMilliseconde1791477431997,
  VerrouillageDate1791737688030,
  ComptageLectures1792099476494,
  Medias1792100161436,
  Avatar1792101373024,
  ReglagesLecture1792232124385,
  Limites1792250556806,
  Apparence1792251152107,
  MesLectures1792252868090,
  Selections1792253380573,
  SaisieIntelligente1792254000000,
  Notifications1793021640920,
  ReindexationsSuivies1793030000000,
];
