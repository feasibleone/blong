import eslintReact from '@eslint-react/eslint-plugin';
import json from '@eslint/json';
import markdown from '@eslint/markdown';
import {defineConfig} from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
    {
        files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        languageOptions: {globals: {...globals.browser, ...globals.node}},
        settings: {
            react: {version: '19.0'},
        },
    },
    {files: ['**/*.json'], plugins: {json}, language: 'json/json', extends: ['json/recommended']},
    {files: ['**/*.jsonc'], plugins: {json}, language: 'json/jsonc', extends: ['json/recommended']},
    {
        files: ['**/*.md'],
        plugins: {markdown},
        language: 'markdown/gfm',
        extends: ['markdown/recommended'],
    },
    tseslint.configs.recommended,
    eslintReact.configs.recommended,
]);
