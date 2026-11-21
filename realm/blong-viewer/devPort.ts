import {existsSync, readFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';

/**
 * devPort.ts — the UDP port this process's viewer listens on when no developer has named one.
 *
 * The number cannot be one constant. Three suites load the viewer — the realm's own, the chat and
 * sport demos and `blong-suite` — and CI runs their packages side by side, so each bound UDP 9999 and
 * all but the first died at boot with `EADDRINUSE`. It cannot be the kernel's choice either: the
 * address is shared, and the half that sends is a writer the realm installs at start — after the
 * receiver has to be listening, so a port the kernel picked has nobody to tell (`@@D-953`).
 *
 * So it is derived, the way the Playwright runner derives its pair: **9600 + the package's index in
 * `rush.json`**. Both halves read it from the realm, so they agree by construction, and two packages
 * never share a number.
 *
 * Two runs keep the conventional 9999 instead. A machine with a developer's `.blong_devrc` names the
 * collector once, for every package it runs (`log.destination: {port: 9999}`), and a derived number
 * is then a port nothing sends to — so the file's presence settles it. A directory tree with no
 * `rush.json` is the other: a container, or a checkout of one realm, where 9999 is the port the
 * deployment's Service targets.
 */
const DERIVED_BASE = 9600;

/** The port every run that can have only one viewer expects: what a deployment's Service publishes. */
const CONVENTIONAL_PORT = 9999;

/** Walk up from `start` to the first directory that holds `fileName`. */
function findUp(start: string, fileName: string): string | null {
    let directory = resolve(start);
    for (;;) {
        if (existsSync(join(directory, fileName))) return directory;
        const parent = dirname(directory);
        if (parent === directory) return null;
        directory = parent;
    }
}

/**
 * The UDP port the viewer listens on for the package in `from`.
 *
 * The directory is a parameter rather than only the process's own so the rule can be tested where
 * the fixtures are: both callers are evaluated by the process the package started, so in a run they
 * are the same tree.
 */
export function viewerUdpPort(from: string = process.cwd()): number {
    // A developer's rc writes the destination for every package on the machine, and the listener has
    // to answer on the port it names rather than beside it.
    if (findUp(from, '.blong_devrc')) return CONVENTIONAL_PORT;
    try {
        const pkgDir = findUp(from, 'package.json');
        const rushDir = findUp(from, 'rush.json');
        if (!pkgDir || !rushDir) return CONVENTIONAL_PORT;
        const {name} = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
            name?: string;
        };
        if (!name) return CONVENTIONAL_PORT;
        // Counted rather than parsed: `rush.json` is JSON with comments, and the index is the only
        // thing wanted from it — the ordinal of the entry that names this package.
        const text = readFileSync(join(rushDir, 'rush.json'), 'utf8');
        const at = text.indexOf(`"packageName": "${name}"`);
        if (at < 0) return CONVENTIONAL_PORT;
        const index = [...text.slice(0, at).matchAll(/"packageName":/g)].length;
        return DERIVED_BASE + index;
    } catch {
        return CONVENTIONAL_PORT;
    }
}
