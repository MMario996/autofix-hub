'use strict';
const js = require('@eslint/js');
const globals = require('globals');

// Geprueft werden die neuen Dateien der Oberflaeche und die Werkzeuge.
// Die bestehenden AutoFix-Dateien (Code.gs, Settings.gs, ...) bleiben bewusst
// aussen vor, damit an ihrer Logik nichts angefasst werden muss.
module.exports = [
  { ignores: ['node_modules/**', 'preview/**', 'docs/**', 'Index.html', 'Code.gs', 'Database.gs', 'Settings.gs', 'PromptEditorAccess.gs', 'Doget patch.gs'] },
  js.configs.recommended,
  { rules: { 'no-empty': ['error', { allowEmptyCatch: true }], eqeqeq: ['error', 'always', { null: 'ignore' }] } },
  {
    files: ['**/*.gs'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script' },
    rules: { 'no-undef': 'off', 'no-unused-vars': 'off', 'preserve-caught-error': 'off' }
  },
  {
    files: ['ui/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser } },
    rules: { 'no-unused-vars': ['error', { varsIgnorePattern: '^(App|I18N|applyI18n|t)$', caughtErrors: 'none' }] }
  },
  {
    files: ['tools/**/*.js', 'tests/**/*.js', 'tests-ui/**/*.js', 'eslint.config.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: { ...globals.node, ...globals.browser } }
  },
  {
    files: ['tools/mock-backend.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } }
  }
];
