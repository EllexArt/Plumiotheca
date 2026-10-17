// Applique l’apparence avant le premier affichage (pas de flash de mauvais thème) : mode
// et ambiance (#77) enregistrés, sinon la préférence du système et Lueur.
// src/app/theme.tsx prend ensuite le relais (mêmes clés).
(function () {
  var choice = null;
  var palette = null;
  try {
    choice = localStorage.getItem('plumiotheca.theme');
    palette = localStorage.getItem('plumiotheca.ambiance');
  } catch {
    // Stockage indisponible (navigation privée stricte) : préférence du système, Lueur.
  }
  var dark =
    choice === 'dark' ||
    (choice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  // Ambiance inconnue : les jetons de Lueur s’appliquent (aucune règle ne la reconnaît).
  document.documentElement.dataset.palette = /^[a-z][a-z0-9-]{1,30}$/.test(palette || '')
    ? palette
    : 'lueur';
})();
