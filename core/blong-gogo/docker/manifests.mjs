/**
 * Keep the Dockerfile's manifest copies in step with `rush.json`.
 *
 * `blong-gogo.Dockerfile` needs every package's `package.json` in the image *before* it installs the
 * dependency tree, and nothing else from the sources: the install is the expensive layer (pnpm's
 * link farm plus `node-rdkafka`'s native build, minutes of it), so a source edit must not invalidate
 * it (T-263). `COPY --parents rush.json **\/package.json` would say exactly that, and it is a BuildKit
 * feature podman's builder rejects — the image has to build with `podman build` because that is what
 * the dev-cluster runbook prescribes (D-369, F-411). `ADD` of a tarball would work and needs a step
 * before the build that a reviewer cannot see in a diff.
 *
 * So the copies are written out, and this script is what writes them:
 *
 *     node core/blong-gogo/docker/manifests.mjs --write   # after adding or removing a package
 *     node core/blong-gogo/docker/manifests.mjs --check   # CI: fails when the block is stale
 *
 * A missing line is not silent: `rush install` resolves the workspace from these files, so a package
 * whose `package.json` never reached the image is a package the install does not see.
 */
import {readFileSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const BEGIN = '# BEGIN GENERATED package manifests';
const END = '# END GENERATED package manifests';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const dockerfilePath = join(here, 'blong-gogo.Dockerfile');

/**
 * `rush.json` is JSON with comments — including a commented-out project block that a pattern match
 * would happily read as two more packages, one of which does not exist and would fail the build.
 */
function withoutComments(text) {
    let out = '';
    let inString = false;
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        const next = text[index + 1];
        if (inString) {
            out += char;
            if (char === '\\') {
                out += next;
                index++;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
            out += char;
            continue;
        }
        if (char === '/' && next === '/') {
            while (index < text.length && text[index] !== '\n') index++;
            out += '\n';
            continue;
        }
        if (char === '/' && next === '*') {
            index += 2;
            while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
                index++;
            }
            index++;
            continue;
        }
        out += char;
    }
    return out;
}

/** The project folders, in `rush.json` declaration order — the order the ports derive from. */
function projectFolders() {
    const rush = JSON.parse(withoutComments(readFileSync(join(repoRoot, 'rush.json'), 'utf8')));
    return rush.projects.map(project => project.projectFolder);
}

/**
 * A package's `file:` dependencies, as paths relative to the repository root.
 *
 * These are not in `rush.json` and not a package.json, so a manifest-only layer leaves them out —
 * and pnpm refuses the install with `ERR_PNPM_LINKED_PKG_DIR_NOT_FOUND` (measured: the first build
 * of the manifest layer failed in 27 s on `core/blong/types/ut-function.merge`, a vendored types
 * package declared as `file:./types/ut-function.merge`). They are small directories beside the
 * package that declares them, so they belong in the same layer.
 */
function localDependencies(folder) {
    const pkg = JSON.parse(readFileSync(join(repoRoot, folder, 'package.json'), 'utf8'));
    const specs = Object.assign(
        {},
        pkg.dependencies,
        pkg.devDependencies,
        pkg.optionalDependencies,
        pkg.peerDependencies,
    );
    return Object.entries(specs)
        .filter(([, spec]) => typeof spec === 'string' && spec.startsWith('file:'))
        .map(([, spec]) =>
            join(folder, spec.slice('file:'.length))
                .replace(/\/package\.json$/, '')
                .replace(/^\.\//, ''),
        );
}

/** The generated block: one copy per package, `--parents` written out by hand. */
function block() {
    const lines = [];
    for (const folder of projectFolders()) {
        lines.push(`COPY ${folder}/package.json ./${folder}/`);
        for (const dependency of localDependencies(folder)) {
            const isDirectory = statSync(join(repoRoot, dependency)).isDirectory();
            lines.push(
                isDirectory
                    ? `COPY ${dependency}/ ./${dependency}/`
                    : `COPY ${dependency} ./${dirname(dependency)}/`,
            );
        }
    }
    return [BEGIN, ...lines, END].join('\n');
}

/** Replace what sits between the markers, leaving every other byte of the Dockerfile alone. */
function withBlock(dockerfile) {
    const from = dockerfile.indexOf(BEGIN);
    const to = dockerfile.indexOf(END);
    if (from === -1 || to === -1) {
        throw new Error(`blong-gogo.Dockerfile has no ${BEGIN} … ${END} marker pair`);
    }
    return dockerfile.slice(0, from) + block() + dockerfile.slice(to + END.length);
}

const wanted = withBlock(readFileSync(dockerfilePath, 'utf8'));
const current = readFileSync(dockerfilePath, 'utf8');
const write = process.argv.includes('--write');

if (wanted === current) {
    console.log(`# manifests: ${projectFolders().length} package.json copies, up to date`);
} else if (write) {
    writeFileSync(dockerfilePath, wanted);
    console.log(`# manifests: ${projectFolders().length} package.json copies written`);
} else {
    const before = new Set(current.split('\n'));
    const after = new Set(wanted.split('\n'));
    for (const line of after)
        if (!before.has(line) && line.startsWith('COPY')) {
            console.error(`missing: ${line}`);
        }
    for (const line of before)
        if (!after.has(line) && line.startsWith('COPY')) {
            console.error(`stale:   ${line}`);
        }
    console.error('# manifests are stale — run: node core/blong-gogo/docker/manifests.mjs --write');
    process.exit(1);
}
