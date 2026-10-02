// Contrats partagés entre l'API et l'application web.
//
// Conventions :
// - les corps de requête sont des `z.strictObject` : un champ inconnu est refusé (400) ;
// - chaque schéma exporte aussi son type (`z.infer`) sous le même nom ;
// - aucun schéma ne contient l'e-mail d'une personne, sauf ceux de son propre compte.
import { z } from 'zod';

// Messages de validation en français, côté API comme côté web : ils peuvent être affichés
// et lus par un lecteur d'écran tels quels. Le champ `code` reste stable pour adapter un message.
z.config(z.locales.fr());

export * from './errors.js';
export * from './health.js';
