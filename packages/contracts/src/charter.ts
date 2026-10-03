// Charte de la communauté (texte complet : docs/charte.md). Chaque article sert de motif
// aux décisions de modération ; un test vérifie que cette liste et le texte concordent.

/** Version en vigueur : l'augmenter oblige chacune à accepter la nouvelle charte. */
export const CHARTER_VERSION = '1';

export const CHARTER_ARTICLES = {
  '1.1': 'Critiquer le texte, jamais la personne',
  '1.2': 'Pas de harcèlement',
  '1.3': 'Pas de propos haineux ou discriminatoires',
  '1.4': 'Respecter les limites des autres',
  '2.1': 'Pas de messages privés',
  '2.2': 'Pas de déplacement vers une messagerie extérieure',
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
  '4.6': 'Pas de contenu illégal',
  '5.1': 'Publier ses propres créations',
  '5.2': 'Fanfictions créditées et choix des autrices respectés',
  '5.3': 'Droits des artistes',
  '5.4': 'Description des images',
  '5.5': 'Images générées par IA déclarées',
  '6.1': 'Pas de manipulation ni de publicité',
  '6.2': 'Un compte par personne',
  '6.3': 'Âge déclaré véridique (15 ans minimum)',
  '6.4': 'Signaler plutôt que répondre',
  '7.1': 'Pouvoirs des animatrices de cercle',
  '7.2': 'Décisions motivées de l’équipe',
  '7.3': 'Droit d’appel',
  '7.4': 'Action immédiate en cas de danger',
  '8.1': 'Évolution de la charte',
} as const;

export type CharterArticle = keyof typeof CHARTER_ARTICLES;
