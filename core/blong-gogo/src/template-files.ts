import {globSync} from 'tinyglobby';

/**
 * Files always excluded from the `@feasibleone/blong-kopi` scaffolding
 * template.
 *
 * This is the SINGLE source of truth for "what counts as a template file". It
 * is shared by:
 *  - `createRealm` (`src/kopi.ts`) — scaffolds a new realm from the template
 *  - `scripts/copy-template.mjs` — bundles the template at publish time
 *
 * Keeping the list here (instead of inlined in both consumers) prevents the
 * two from drifting out of sync.
 */
export const TEMPLATE_FILES_IGNORE = [
    '**/node_modules/**',
    '**/dist/**',
    '**/.rush/**',
    '**/rush-logs/**',
    '**/.gitignore',
    // Playwright screenshot baselines are generated per realm — a new realm
    // runs `npm run playwright:update` to create its own.
    '**/*-snapshots/**',
    // Dev/CI artifacts (Playwright output, Allure reports) are per-realm too.
    '**/.playwright/**',
    '**/allure-results/**',
    '**/allure-report/**',
];

export interface ListTemplateFilesOptions {
    /**
     * Extra ignore globs appended to {@link TEMPLATE_FILES_IGNORE} for a
     * specific consumer. E.g. `createRealm` also skips `package.json` (it
     * writes its own, with the realm name substituted), while the publish
     * bundle keeps `package.json` (createRealm reads it to name the realm).
     */
    extraIgnore?: string[];
}

/**
 * Enumerate the scaffolding template files under `cwd` (recursive, including
 * dotfiles), excluding {@link TEMPLATE_FILES_IGNORE} plus any
 * {@link ListTemplateFilesOptions.extraIgnore}.
 */
export function listTemplateFiles(cwd: string, options: ListTemplateFilesOptions = {}): string[] {
    return globSync(['**/*'], {
        cwd,
        dot: true,
        onlyFiles: true,
        ignore: [...TEMPLATE_FILES_IGNORE, ...(options.extraIgnore ?? [])],
    });
}
