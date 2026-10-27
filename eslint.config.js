import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['docs/'] },
  js.configs.recommended,
  {
    files: ['app_main/**/*.js', 'libs/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['server/**/*.js', 'tests/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
];
