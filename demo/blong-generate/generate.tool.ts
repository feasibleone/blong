/**
 * Does a fresh generation still produce the stubs the repository keeps — and if it does not, which
 * one moved?
 *
 * A generator that never overwrites a file (which is what makes it safe to leave running) cannot
 * answer that about itself in place: an existing stub is exactly the case it skips. So this tool
 * stages a **throwaway copy** of the demo, runs the real dev load there, and compares what that run
 * wrote with what is committed. Nothing in the repository is touched unless the comparison fails and
 * `--update` was asked for.
 *
 * ```bash
 * npm run generate:check     # exit 1 and list the drift
 * npm run generate:update    # rewrite the stubs from the documents
 * ```
 *
 * The staging copy sits in the system temp directory, with `node_modules` linked back to the package,
 * so the copies resolve `@feasibleone/blong` exactly as the repository does.
 */

import load from '@feasibleone/blong-gogo';
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    rmSync,
    statSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The line that says a stub is still a stub — the same one `ApiSchema` writes and reads.
 *
 * Its absence is not damage: an editor removes the unused import the first time the file is saved,
 * which is precisely how a file stops being generated and becomes the developer's. Both verbs below
 * apply that rule, so an edited stub is neither reported as drift nor overwritten.
 */
const MARKER = "import unchanged from '@feasibleone/blong';";

/**
 * `--update` is **this tool's** flag, and the loaded suite reads `process.argv` too: left in place it
 * arrives as a configuration key, is validated as one, and the load dies with
 * `unknown key 'update' in the config block`. Taking it out before anything loads keeps the two
 * command lines apart.
 */
const updateWanted = process.argv.includes('--update');
process.argv = process.argv.filter(argument => argument !== '--update');

/** The realms the suite serves; each is staged the same way. */
const realms = ['orders', 'stock'];

/** The directories inside a realm that hold no source a load needs. */
const stagedOut = new Set(['node_modules', '.tap', '.rush', '.ci-report', 'allure-results']);

/** One file a fresh generation produced, and what the repository has beside it. */
export interface IDrift {
    /** Path relative to the demo, e.g. `orders/orchestrator/contract/ordersContractAdd.ts`. */
    file: string;
    /** What the generator writes now. */
    generated: string;
    /** What the repository holds, when it holds anything. */
    committed?: string;
}

/**
 * Copy the demo into `target`, with every `orchestrator/` folder present and empty — the state a
 * repository is in before a single stub has been generated.
 *
 * The folders are copied as they are and their `.ts` files removed afterwards rather than recreated
 * from a list: the generator only fills folders a scan has recorded, so a staged tree whose folders
 * were missing would report every operation as unplaced and compare nothing at all.
 */
function stage(target: string): void {
    cpSync(join(here, 'server.ts'), join(target, 'server.ts'));
    cpSync(join(here, 'package.json'), join(target, 'package.json'));
    for (const realm of realms) {
        cpSync(join(here, realm), join(target, realm), {
            recursive: true,
            filter: source => !stagedOut.has(relative(join(here, realm), source).split(/[\\/]/)[0]),
        });
        emptyHandlers(join(target, realm, 'orchestrator'));
    }
    // The copies import `@feasibleone/blong`; resolution walks up from the staged file, so the
    // package's own modules have to be reachable from the staging root.
    if (existsSync(join(here, 'node_modules')))
        symlinkSync(join(here, 'node_modules'), join(target, 'node_modules'), 'dir');
}

/** Remove the handler files a staged realm had, keeping the folders that held them. */
function emptyHandlers(dir: string): void {
    for (const entry of readdirSync(dir, {withFileTypes: true})) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) emptyHandlers(path);
        else if (entry.name.endsWith('.ts')) rmSync(path);
    }
}

/** Run the dev load on a staged copy and return `{relative path → content}` for what it wrote. */
async function generate(): Promise<Record<string, string>> {
    const target = mkdtempSync(join(tmpdir(), 'blong-generate-check-'));
    try {
        stage(target);
        const {default: server} = (await import(pathToFileURL(join(target, 'server.ts')).href)) as {
            default: unknown;
        };
        const platform = await load(
            server as Parameters<typeof load>[0],
            'blong-generate-check',
            'blong-generate-check',
            ['microservice', 'integration', 'dev'],
        );
        await platform.start!({});
        await platform.stop!();

        const written: Record<string, string> = {};
        for (const realm of realms) {
            const orchestrator = join(target, realm, 'orchestrator');
            for (const group of readdirSync(orchestrator)) {
                for (const name of readdirSync(join(orchestrator, group))) {
                    if (!name.endsWith('.ts')) continue;
                    const file = join(orchestrator, group, name);
                    written[relative(target, file)] = readFileSync(file, 'utf-8');
                }
            }
        }
        return written;
    } finally {
        rmSync(target, {recursive: true, force: true});
    }
}

/** The stubs a fresh generation produces that the repository does not have — or has differently. */
export async function drift(): Promise<IDrift[]> {
    const generated = await generate();
    const found: IDrift[] = [];
    for (const [file, content] of Object.entries(generated)) {
        const committed = join(here, file);
        let onDisk: string | undefined;
        try {
            if (statSync(committed).isFile()) onDisk = readFileSync(committed, 'utf-8');
        } catch {
            // Not there at all: that is drift too, and the message says so.
        }
        // A file that lost its marker was saved in an editor, so it is the developer's now: not stale,
        // just no longer generated.
        if (onDisk !== undefined && !onDisk.includes(MARKER)) continue;
        if (onDisk !== content) found.push({file, generated: content, committed: onDisk});
    }
    return found;
}

/** What a run took over from the generator: files on disk without the marker, and so left alone. */
export async function taken(): Promise<string[]> {
    const generated = await generate();
    const held: string[] = [];
    for (const file of Object.keys(generated)) {
        try {
            const onDisk = readFileSync(join(here, file), 'utf-8');
            if (!onDisk.includes(MARKER)) held.push(file);
        } catch {
            // Missing files are drift, not taken-over files.
        }
    }
    return held;
}

/** Write the fresh generation over the committed stubs, creating the ones that are missing. */
export async function update(): Promise<{written: string[]; kept: string[]}> {
    const generated = await generate();
    const written: string[] = [];
    const kept: string[] = [];
    for (const [file, content] of Object.entries(generated)) {
        const target = join(here, file);
        // Same rule as the generator itself: a file the developer took over is never written over,
        // which is why `update` is safe to run without looking at the diff first.
        try {
            if (!readFileSync(target, 'utf-8').includes(MARKER)) {
                kept.push(file);
                continue;
            }
        } catch {
            // Not there yet: the generator creates it.
        }
        mkdirSync(dirname(target), {recursive: true});
        writeFileSync(target, content, 'utf-8');
        written.push(file);
    }
    return {written, kept};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (updateWanted) {
        const {written, kept} = await update();
        process.stdout.write(`generate:update — wrote ${written.length} stub(s)\n`);
        for (const file of written) process.stdout.write(`  ${file}\n`);
        if (kept.length) {
            process.stdout.write(`  kept ${kept.length} file(s) the developer has taken over:\n`);
            for (const file of kept) process.stdout.write(`    ${file}\n`);
        }
    } else {
        const moved = await drift();
        const held = await taken();
        if (moved.length === 0) {
            process.stdout.write(
                `generate:check — the stubs match the documents` +
                    `${held.length ? ` (${held.length} taken over by hand, not compared)` : ''}\n`,
            );
        } else {
            process.stderr.write(
                `generate:check — ${moved.length} stub(s) do not match the documents; ` +
                    'run `npm run generate:update`\n',
            );
            for (const {file} of moved) process.stderr.write(`  ${file}\n`);
            process.exitCode = 1;
        }
    }
}
