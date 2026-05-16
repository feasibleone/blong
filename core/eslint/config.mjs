import eslintReact from '@eslint-react/eslint-plugin';
import json from '@eslint/json';
import markdown from '@eslint/markdown';
import {defineConfig} from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
    {
        // Ignore generated and tool-managed directories across all packages
        ignores: [
            '.rush/**',
            '.heft/**',
            '.tap/**',
            'dist/**',
            'storybook-static/**',
            'public/**',
            'rush-logs/**',
            'coverage/**',
            '**/.eslintrc*.cjs',
        ],
    },
    {
        files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        languageOptions: {globals: {...globals.browser, ...globals.node}},
        settings: {
            react: {version: '19.0'},
        },
    },
    {files: ['**/*.json'], plugins: {json}, language: 'json/jsonc', extends: ['json/recommended']},
    {files: ['**/*.jsonc'], plugins: {json}, language: 'json/jsonc', extends: ['json/recommended']},
    {
        files: ['**/*.md'],
        plugins: {markdown},
        language: 'markdown/gfm',
        extends: ['markdown/recommended'],
    },
    tseslint.configs.recommended,
    // Restrict React rules to script files only — the plugin crashes when run on JSON/MD ASTs
    {
        ...eslintReact.configs.recommended,
        files: ['**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}'],
    },
    // Allow _ prefix convention for intentionally unused variables/parameters
    {
        files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
        },
    },
]);
