// Charte de la communauté (texte complet : docs/charte.md). Chaque article sert de motif
// aux décisions de modération ; un test vérifie que cette liste et le texte concordent.

/**
 * Version en vigueur : l'augmenter oblige chacune à accepter la nouvelle charte. Règle
 * d'équipe : tout changement du texte (une virgule exceptée) fait monter ce numéro, et
 * les décisions de modération gardent la version avec l'article cité.
 */
export const CHARTER_VERSION = '1';

export const CHARTER_ARTICLES = {
  '1.1': 'Critiquer le texte, jamais la personne',
  '1.2': 'Pas de harcèlement',
  '1.3': 'Pas de propos haineux ou discriminatoires',
  '1.4': 'Respecter les limites des autres',
  '1.5': 'Aucune sollicitation ni commentaire sexuel envers une personne',
  '2.1': 'Pas de messages privés',
  '2.2': 'Ne pas pousser vers des échanges privés ailleurs',
  '2.3': 'Bêta-lecture dans les cercles uniquement',
  '3.1': 'Respect du pseudonymat',
  '3.2': 'Aucune information personnelle sur autrui',
  '3.3': 'Protéger ses propres informations',
  '3.4': 'Pas d’usurpation d’identité',
  '4.1': 'Classement et avertissements honnêtes',
  '4.2': 'Contenu sexuel au service du récit, en Mature',
  '4.3': 'Aucun contenu sexuel impliquant un personnage mineur',
  '4.4': 'Aucune image explicite',
  '4.5': 'Sujets graves sans incitation',
  '4.6': 'La fiction peut tout raconter, sans appel au passage à l’acte',
  '4.7': 'Personnes réelles : s’inspirer sans nuire',
  '5.1': 'Publier ses propres créations',
  '5.2': 'Fanfictions bienvenues, œuvre d’origine créditée',
  '5.3': 'Droits des artistes',
  '5.4': 'Description des images',
  '5.5': 'Images et textes générés par IA déclarés',
  '6.1': 'Pas de manipulation des chiffres ni de publicité',
  '6.2': 'Plusieurs comptes permis, jamais pour contourner une sanction',
  '6.3': 'Âge déclaré véridique (15 ans minimum)',
  '6.4': 'Signalements ouverts à tous',
  '7.1': 'Pouvoirs des animatrices de cercle',
  '7.2': 'Décisions motivées de l’équipe',
  '7.3': 'Droit d’appel',
  '7.4': 'Action immédiate en cas de danger',
  '8.1': 'Évolution de la charte',
} as const;

export type CharterArticle = keyof typeof CHARTER_ARTICLES;
