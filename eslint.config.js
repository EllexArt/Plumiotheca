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
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', 'apps/api/postman/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // API (Node)
  {
    files: ['apps/api/**/*.{ts,js}'],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
  },

  // Application web (navigateur, React) : accessibilité vérifiée par jsx-a11y.
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'jsx-a11y': jsxA11y, 'react-hooks': reactHooks },
    rules: {
      ...jsxA11y.flatConfigs.strict.rules,
      ...reactHooks.configs.recommended.rules,
    },
  },

  // TEMPORAIRE : prototype Express voué à la réécriture NestJS (#9 à #16).
  // Supprimer ce bloc avec l'ancien code ; la nouvelle API respecte la règle.
  {
    files: ['apps/api/src/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'warn' },
  },

  // Fichiers de configuration en CommonJS
  {
    files: ['**/*.cjs', 'apps/api/jest.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  // Désactive les règles de style gérées par Prettier.
  prettier,
);
