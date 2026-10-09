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
            '.playwright/**',
            '.rush/**',
            '.heft/**',
            'allure-results/**',
            'allure-report/**',
            '.tap/**',
            'dist/**',
            'storybook-static/**',
            'public/**',
            'rush-logs/**',
            'coverage/**',
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
    // Allow _ prefix convention for intentionally unused variables/parameters,
    // plus the `unchanged` marker the `blong-kopi` scaffolder prefixes to every
    // generated source (`import unchanged from '@feasibleone/blong';`) so a
    // re-scaffold can tell an untouched file from a hand-edited one. The marker
    // is an import the file never uses, so it is ignored by name here rather
    // than stripped from every scaffolded file.
    //
    // The prefix covers *variables* as well as arguments, and it has to: the
    // idiom it marks is dropping a property through the rest of a destructuring
    // (`const {d: _d, p: _p, ...rest} = jwk`), where every dropped name needs to
    // be distinct and so cannot be `_` alone. Without this the idiom is
    // unwritable, which is how the rule was first read — as a rule against it.
    {
        files: ['**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_|^unchanged$',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
        },
    },
]);
