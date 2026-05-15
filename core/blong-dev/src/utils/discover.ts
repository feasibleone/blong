import {existsSync} from 'node:fs';
import {join} from 'node:path';

const ESLINT_CONFIG_FILES = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    'eslint.config.ts',
    '.eslintrc.js',
    '.eslintrc.cjs',
    '.eslintrc.yaml',
    '.eslintrc.yml',
    '.eslintrc.json',
    '.eslintrc',
];

/** Returns true if a tsconfig.json exists in the given directory. */
export function hasTsConfig(dir: string): boolean {
    return existsSync(join(dir, 'tsconfig.json'));
}

/**
 * Returns true if an ESLint configuration file is present in the given directory.
 * Checks flat-config (eslint.config.*) and legacy (.eslintrc.*) formats.
 */
export function hasEslintConfig(dir: string): boolean {
    return ESLINT_CONFIG_FILES.some(f => existsSync(join(dir, f)));
}
