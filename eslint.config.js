// @ts-check
// eslint-plugin-jsx-a11y ne déclare pas encore ESLint 10 dans ses peerDependencies :
// ses règles ont été vérifiées sous ESLint 10 (avertissement de pair attendu).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // API et paquets partagés (Node) : règles s'appuyant sur les types (promesses
  // oubliées, valeurs `any` qui se propagent…).
  {
    files: ['apps/api/**/*.ts', 'packages/**/*.ts'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  // Scripts Node (infrastructure, configuration)
  {
    files: ['infra/**/*.mjs', '*.js', '*.mjs'],
    languageOptions: { globals: globals.node },
  },

  // Scripts servis tels quels au navigateur (apps/web/public)
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: globals.browser },
  },

  // Application web (navigateur, React) : accessibilité vérifiée par jsx-a11y.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'jsx-a11y': jsxA11y, 'react-hooks': reactHooks },
    rules: {
      ...jsxA11y.flatConfigs.strict.rules,
      // Règles non incluses dans le preset strict, exigées par notre définition de « terminé » (#83).
      'jsx-a11y/control-has-associated-label': [
        'error',
        {
          ignoreElements: ['audio', 'canvas', 'embed', 'input', 'textarea', 'tr', 'video'],
          ignoreRoles: [
            'grid',
            'listbox',
            'menu',
            'menubar',
            'radiogroup',
            'row',
            'tablist',
            'toolbar',
            'tree',
            'treegrid',
          ],
          includeRoles: ['alert', 'dialog'],
        },
      ],
      'jsx-a11y/no-aria-hidden-on-focusable': 'error',
      'jsx-a11y/prefer-tag-over-role': 'error',
      // Liens au texte ambigu (RGAA 6.1).
      'jsx-a11y/anchor-ambiguous-text': [
        'error',
        {
          words: ['ici', 'cliquez ici', 'lire la suite', 'en savoir plus', 'plus', 'lien', 'voir'],
        },
      ],
      ...reactHooks.configs.recommended.rules,
    },
  },

  // Fichiers de configuration en CommonJS
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  // Désactive les règles de style gérées par Prettier.
  prettier,
);
