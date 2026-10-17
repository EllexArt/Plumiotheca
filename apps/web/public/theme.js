// Applique le thème avant le premier affichage (pas de flash clair → sombre) : le choix
// enregistré, sinon la préférence du système. src/app/theme.tsx prend ensuite le relais.
(function () {
  var choice = null;
  try {
    choice = localStorage.getItem('plumiotheca.theme');
  } catch {
    // Stockage indisponible (navigation privée stricte) : préférence du système.
  }
  var dark =
    choice === 'dark' ||
    (choice !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
