// Contrats partagés entre l'API et l'application web.
//
// Conventions :
// - les corps de requête sont des `z.strictObject` : un champ inconnu est refusé (400) ;
// - chaque schéma exporte aussi son type (`z.infer`) sous le même nom ;
// - aucun schéma ne contient l'e-mail d'une personne, sauf ceux de son propre compte.
export * from './errors.js';
export * from './health.js';
