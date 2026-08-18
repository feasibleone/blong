import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'fs';
import {basename, dirname, join} from 'path';
import {globSync} from 'tinyglobby';

export interface CreateRealmOptions {
    /**
     * Entity name — the "object" of the `subjectObjectPredicate` triple.
     * Defaults to `entry`. Substituted for the `$object` / `$Object` template
     * tokens (in both file paths and contents).
     */
    object?: string;
}

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * Scaffold a new realm from the `@feasibleone/blong-kopi` template.
 *
 * Copies the whole template into `destUrl` (the realm folder), substituting:
 *  - `$subject` → the destination folder basename (the realm name)
 *  - `$Subject` → capitalized realm name
 *  - `$object`  → the entity name (default `entry`)
 *  - `$Object`  → capitalized entity name
 *
 * Every generated `.ts` file is prefixed with an `import unchanged ...` marker;
 * on re-scaffold, files that do NOT start with that marker are treated as hand
 * edits and left alone (idempotent).
 *
 * Used by both the runtime auto-trigger (`blong-gogo/src/load.ts`) and the
 * explicit `blong realm <name>` CLI path (`blong-gogo/bin/blong.ts`).
 */
export async function createRealm(
    destUrl: string,
    logger?: {warn?: (message: string) => void},
    options: CreateRealmOptions = {},
): Promise<string[]> {
    const result = [];
    const url = import.meta.resolve('@feasibleone/blong-kopi/package.json');
    const cwd = url.startsWith('file://') ? dirname(url.slice(7)) : url;
    destUrl = destUrl.startsWith('file://') ? dirname(destUrl.slice(7)) : destUrl;
    const subject = basename(destUrl);
    const object = options.object ?? 'entry';
    const replace = (str: string): string =>
        str
            .replaceAll('$subject', subject)
            .replaceAll('$Subject', capitalize(subject))
            .replaceAll('$object', object)
            .replaceAll('$Object', capitalize(object));
    logger?.warn?.(`Creating realm ${destUrl} from ${cwd} (entity: ${object})`);
    for (const file of globSync(['**/*'], {
        cwd,
        dot: true,
        onlyFiles: true,
        ignore: [
            '**/node_modules/**',
            '**/dist/**',
            '**/.rush/**',
            '**/rush-logs/**',
            'package.json',
            // The scaffolder itself and template-specific docs are not scaffolded.
            'kopi.ts',
            'README.md',
            'CHANGELOG.md',
        ],
    })) {
        const [source, dest] = [join(cwd, file), join(destUrl, replace(file))];
        if (!existsSync(dest) || readFileSync(dest, 'utf8').startsWith('import unchanged')) {
            mkdirSync(dirname(dest), {recursive: true});
            const content = readFileSync(source, 'utf8');
            writeFileSync(
                dest,
                file.endsWith('.ts')
                    ? "import unchanged from '@feasibleone/blong';\r" + replace(content)
                    : replace(content),
            );
            result.push(dest);
        }
    }
    writeFileSync(
        join(destUrl, 'package.json'),
        readFileSync(join(cwd, 'package.json'), 'utf8').replace('@feasibleone/blong-kopi', subject),
    );
    return result;
}
