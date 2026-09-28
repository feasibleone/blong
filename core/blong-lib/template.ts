import {globSync} from 'tinyglobby';

/**
 * Files always excluded when enumerating a scaffolding template.
 *
 * This is the SINGLE source of truth for "what counts as a template file". It
 * is shared by:
 *  - `createRealm` (`blong-gogo/src/kopi.ts`) — scaffolds a new realm
 *  - `scripts/copy-template.mjs` — bundles the template at publish time
 *  - `blong-kukum` — enumerates primitive templates
 *
 * Keeping the list here (instead of inlined in every consumer) prevents the
 * consumers from drifting out of sync.
 */
export const TEMPLATE_FILES_IGNORE = [
    '**/node_modules/**',
    '**/dist/**',
    '**/.rush/**',
    '**/rush-logs/**',
    '**/.gitignore',
    // Test runner artifacts (tap coverage/processinfo/test-results) are
    // per-package and may hold hundreds of files.
    '**/.tap/**',
    // Playwright screenshot baselines are generated per realm — a new realm
    // runs `npm run playwright:update` to create its own.
    '**/*-snapshots/**',
    // Dev/CI artifacts (Playwright output, Allure reports) are per-realm too —
    // and so is the CI report (`blong-dev report`) and coverage output, which a
    // package generates and no realm should inherit. `blong-kukum` derives its
    // template walk's skip set from this list, so an entry here is honoured by
    // both scaffolders.
    '**/.playwright/**',
    '**/allure-results/**',
    '**/allure-report/**',
    '**/.ci-report/**',
    '**/coverage/**',
    // Storybook build output: derived from the stories and large (tens of MB),
    // so a template package that built its own Storybook would otherwise ship
    // its static bundle into every scaffolded realm.
    '**/storybook-static/**',
    // Development memory (`blong-dev memory`) belongs to the package that wrote
    // it: the template's entries describe scaffolding, so copying them into a
    // new realm hands it another package's decisions, frictions and todos. The
    // realm gets its own file the first time somebody runs `blong-dev memory add`
    // there (`ensureDoc` writes the header, named for that realm).
    '**/.github/memory/**',
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
 * Enumerate the template files under `cwd` (recursive, including dotfiles),
 * excluding {@link TEMPLATE_FILES_IGNORE} plus any
 * {@link ListTemplateFilesOptions.extraIgnore}.
 *
 * Returns paths relative to `cwd`, using `/` separators.
 */
export function listTemplateFiles(cwd: string, options: ListTemplateFilesOptions = {}): string[] {
    return globSync(['**/*'], {
        cwd,
        dot: true,
        onlyFiles: true,
        ignore: [...TEMPLATE_FILES_IGNORE, ...(options.extraIgnore ?? [])],
    });
}

/** The version a freshly scaffolded realm starts at. */
export const SCAFFOLD_VERSION = '0.1.0';

/**
 * True for the file types a scaffolder stamps with the generated marker
 * (`import unchanged from '@feasibleone/blong'`).
 *
 * The marker is what decides ownership of a file: a later scaffold rewrites it
 * while the marker is there, and leaves it alone once somebody has adopted it.
 * Typescript sources — `.ts` and `.tsx`, including the Storybook config and the
 * stories — carry it; data artifacts (`<name>Merge.yaml`, a procedure `.sql`,
 * `package.json`) never do, so a generated one is always refreshed.
 *
 * Shared because three sites have to agree: `createRealm`, kukum's
 * `planTemplate`, and the merge engine's own ownership check. A `.tsx` file
 * stamped by neither scaffolder is one the merge engine refuses to rewrite —
 * it reads as hand-written.
 */
export function isStampedFile(path: string): boolean {
    return path.endsWith('.ts') || path.endsWith('.tsx');
}

/** The folder prefix every realm package carries (`realm/blong-access`). */
const REALM_PREFIX = 'blong-';

/**
 * The characters a realm name may use.
 *
 * A realm name is not only a label: the template substitutes it into identifiers
 * (`async function marineFixture`), unquoted object keys, file names and the
 * method names derived from its seed files, so a name outside this set produces
 * a realm that does not parse.
 */
const REALM_NAME = /^[a-z][a-z0-9]*$/;

/**
 * The realm name a scaffolded folder stands for.
 *
 * The monorepo names a realm folder `blong-<realm>` while the template substitutes
 * the bare name — it becomes the subject namespace (`marine.entry.add`), an
 * identifier in the generated handlers, a file name, and the config key a suite
 * sets. `blong-` belongs to the package name, which the template re-adds where it
 * needs the app name (`blong-$subject`, `import('@feasibleone/blong-$subject/...')`),
 * so a folder that kept its prefix would otherwise scaffold
 * `async function blong-marineFixture()` — not valid TypeScript.
 *
 * Throws for a name the template cannot render, rather than writing a realm that
 * fails the first time its story, handler or seed is parsed.
 */
export function scaffoldSubject(folder: string): string {
    const name = folder.startsWith(REALM_PREFIX) ? folder.slice(REALM_PREFIX.length) : folder;
    if (!REALM_NAME.test(name)) {
        throw new Error(
            `cannot scaffold realm '${folder}': the realm name is substituted into identifiers, ` +
                'file names and seed method names, so it has to be a single lowercase word of ' +
                'letters and digits — name the folder `blong-<realm>` (blong-marine for the ' +
                'realm marine)',
        );
    }
    return name;
}

/**
 * The package name a scaffolded realm is given for `subject`.
 *
 * The monorepo convention (`realm/blong-access` → `@feasibleone/blong-access`),
 * substituted rather than left for the author to remember. A name that already
 * carries the prefix is not prefixed twice — `blong realm blong-marine` means
 * `@feasibleone/blong-marine`.
 *
 * It matters beyond naming: a suite imports the realm by this name, and the dev
 * database is derived from it (`resolveSuite` strips the scope, so the name is
 * the database prefix).
 */
export function scaffoldPackageName(subject: string): string {
    return `@feasibleone/${subject.startsWith(REALM_PREFIX) ? subject : REALM_PREFIX + subject}`;
}

/**
 * Replace one top-level string field of a JSON document, leaving the rest of the
 * text — key order, indentation, the trailing newline — exactly as it was.
 *
 * Field-wise rather than a `JSON.parse`/`stringify` round trip on purpose: the
 * template's manifest is a hand-maintained file, and re-serialising it would
 * rewrite formatting that nothing else touches. A field the manifest does not
 * declare is left alone rather than appended.
 */
function setManifestField(manifest: string, field: string, value: string): string {
    return manifest.replace(new RegExp(`("${field}"\\s*:\\s*)"[^"]*"`), `$1"${value}"`);
}

/**
 * Rewrite the realm template's own manifest for a scaffolded realm.
 *
 * `createRealm` (`blong-gogo/src/kopi.ts`) and kukum's `planTemplate` both write
 * `package.json` separately from the tree walk — they have to, because the file
 * names the package — so the transformation lives here to keep the two in step
 * (the same reason {@link TEMPLATE_FILES_IGNORE} is shared).
 *
 * Three fields describe the template rather than the new realm: the name (see
 * {@link scaffoldPackageName}), the version (the template's release number is
 * not the realm's — see {@link SCAFFOLD_VERSION}) and the description (which
 * advertised scaffolding).
 */
export function scaffoldManifest(manifest: string, subject: string): string {
    const named = setManifestField(manifest, 'name', scaffoldPackageName(subject));
    const versioned = setManifestField(named, 'version', SCAFFOLD_VERSION);
    return setManifestField(versioned, 'description', `${subject} realm`);
}
