import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['docs/', 'playwright-report/', 'test-results/'] },
  js.configs.recommended,
  {
    files: ['app_main/**/*.js', 'libs/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['server/**/*.js', 'tests/**/*.js', 'scripts/**/*.js', 'e2e/**/*.js', 'playwright.config.js','eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
];
