import type {Dirent} from 'node:fs';

/**
 * The host abstraction the engine needs. It is structurally satisfied by
 * `IPlatformApi`, so the running realm passes `this.platform` straight in while
 * the CLI passes a thin `node:fs` adapter — one implementation, two callers.
 */
export interface PrimitiveHost {
    existsSync(path: string): boolean;
    readFileSync(path: string, options?: {encoding: BufferEncoding}): string | Buffer;
    writeFileSync(path: string, data: string, options?: {encoding: BufferEncoding}): void;
    /** Recursively create a directory. Absent on the browser platform. */
    mkdirSync?(path: string): void;
    scan(...path: string[]): Promise<Dirent[]>;
    statSync(path: string): {size: number};
    join(...paths: string[]): string;
    resolve(...paths: string[]): string;
    dirname(path: string): string;
    basename(path: string, ext?: string): string;
    relative(from: string, to: string): string;
}

/** A single file produced by a primitive, ready to be written. */
export interface PrimitiveFile {
    /** Root-relative target path (POSIX separators). */
    path: string;
    content: string;
    /**
     * Observations worth surfacing to the caller that are not files — for
     * example a test group that could not be registered in the platform
     * bootstrap, which would otherwise silently never execute.
     */
    notices?: string[];
}

/**
 * How `add` treats a file that is already there.
 *
 * - `auto` (default) composes: a machine-generated file is merged into, a
 *   hand-written one is left alone and reported. Adding an entity never drops
 *   its neighbours.
 * - `replace` regenerates the descriptor's plain output and overwrites,
 *   including hand-written files.
 */
export type MergeMode = 'auto' | 'replace';

/** Arguments for a descriptor's merge-aware `compose` hook. */
export interface ComposeOptions {
    host: PrimitiveHost;
    /** Absolute target root. */
    root: string;
    context: PrimitiveContext;
}

/** Predicates every primitive supports through the API. */
export const PREDICATES = ['find', 'get', 'add', 'edit', 'check'] as const;
export type Predicate = (typeof PREDICATES)[number];

export interface PrimitiveContext {
    /** Realm or suite name (the triple subject). */
    subject: string;
    /** Entity name (the triple object). */
    object: string;
    kind: string;
    layer?: string;
    group?: string;
    platform: 'server' | 'browser';
    params: Record<string, unknown>;
}

export interface PrimitiveDescriptor {
    id: string;
    title: string;
    /** Owning skill, so the API can point an agent at the right prose. */
    skill: string;
    summary: string;
    kinds: string[];
    defaultKind: string;
    /** Root-relative directories to scan for `find`. */
    roots: string[];
    /** Files to generate, with content. */
    files(ctx: PrimitiveContext): PrimitiveFile[];
    /**
     * Merge-aware file list.
     *
     * `files()` answers "what would this artifact look like in an empty realm".
     * `compose()` may read what is already on disk and return a non-destructive
     * result instead — appending to an array, adding a sibling file, or splicing
     * an entry into an existing map — so adding an entity never drops the ones
     * already declared. Used for `add`/`edit` under `mode: 'auto'`; `replace`
     * always falls back to `files()`.
     *
     * Return `files(ctx)` unchanged when there is nothing to compose with.
     */
    compose?(options: ComposeOptions): PrimitiveFile[];
    /** Guardrail validations run before anything is written. */
    check?(ctx: PrimitiveContext): string[];
}

// ────────────────────────────────────────────────────────────────────────────
// Naming
// ────────────────────────────────────────────────────────────────────────────

export const capitalize = (value: string): string =>
    value ? value.charAt(0).toUpperCase() + value.slice(1) : value;

const CAMEL = /^[a-z][a-zA-Z0-9]*$/;
const PASCAL = /^[A-Z][a-zA-Z0-9]*$/;

/** The semantic triple name for a handler: `subjectObjectPredicate`. */
export function tripleName(subject: string, object: string, predicate: string): string {
    return `${subject}${capitalize(object)}${capitalize(predicate)}`;
}

/**
 * Guardrails mirrored from `.github/skills/_shared/conventions.md`, applied to
 * names before generation so an agent gets a hard error instead of silent drift.
 */
export function checkNames(name: string, label: string): string[] {
    const problems: string[] = [];
    if (!name) {
        problems.push(`${label} is required`);
        return problems;
    }
    if (!CAMEL.test(name)) {
        problems.push(`${label} '${name}' must be lowerCamelCase (letters and digits only)`);
    }
    return problems;
}

export function checkObject(object: string): string[] {
    const problems = checkNames(object, 'object');
    if (object && !/^[a-z]+$/.test(object) && !CAMEL.test(object)) {
        problems.push(`object '${object}' must be a single lowerCamelCase word`);
    }
    return problems;
}

/**
 * Realm/suite names must be lowerCamelCase.
 *
 * `$subject` is substituted into template *identifiers* (for example an object
 * key in the generated `browser-test.ts`), so a kebab-case name produces
 * syntactically invalid output — exactly the constraint `blong realm <name>`
 * already has. Rejected here with a clearer message than a parse error.
 */
export function checkSubject(subject: string): string[] {
    if (!subject) return ['subject is required'];
    if (!CAMEL.test(subject)) {
        return [
            `subject '${subject}' must be lowerCamelCase: it is substituted into template ` +
                'identifiers, so names like "my-realm" would not parse',
        ];
    }
    return [];
}

export function checkPredicate(predicate: string): string[] {
    const problems = checkNames(predicate, 'predicate');
    if (predicate && !PASCAL.test(capitalize(predicate))) {
        problems.push(`predicate '${predicate}' must be a single word`);
    }
    return problems;
}

// ────────────────────────────────────────────────────────────────────────────
// Generated-file ownership & instructions
// ────────────────────────────────────────────────────────────────────────────

/**
 * The sentinel every generated file carries. Detection uses `includes` (not
 * `startsWith`) so the marker may sit on any line — the same contract as
 * `ApiSchema.generateFile`.
 */
export const UNCHANGED_MARKER = 'import unchanged from';

/** Comment prefix for coding-agent instructions embedded in generated files. */
export const INSTRUCTIONS_TAG = '@kukum-instructions';

export function isGenerated(content: string): boolean {
    return content.includes(UNCHANGED_MARKER);
}

/** Ensure a `.ts` payload starts with the runtime's idempotency sentinel. */
export function withMarker(content: string): string {
    return content.startsWith(UNCHANGED_MARKER)
        ? content
        : `import unchanged from '@feasibleone/blong';\r\n${content}`;
}

function instructionLines(instructions: string[]): string[] {
    return instructions
        .flatMap(instruction => instruction.split(/\r?\n/))
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => `// ${INSTRUCTIONS_TAG}: ${line}`);
}

/** Read the coding-agent instructions embedded in a generated file. */
export function extractInstructions(content: string): string[] {
    return content
        .split(/\r?\n/)
        .filter(line => line.includes(INSTRUCTIONS_TAG))
        .map(line => line.slice(line.indexOf(INSTRUCTIONS_TAG) + INSTRUCTIONS_TAG.length))
        .map(line => line.replace(/^:\s?/, '').trim())
        .filter(Boolean);
}

/** Strip any previously embedded instructions. */
export function stripInstructions(content: string): string {
    return content
        .split(/\r?\n/)
        .filter(line => !line.includes(INSTRUCTIONS_TAG))
        .join('\n');
}

/**
 * Embed `instructions` in `content`, immediately after the first line when that
 * line is the generated marker (so the marker stays first, as `createRealm`'s
 * `startsWith` check requires).
 */
export function applyInstructions(content: string, instructions: string[]): string {
    const base = stripInstructions(content);
    if (!instructions.length) return base;
    const lines = base.split(/\r?\n/);
    const block = instructionLines(instructions);
    const insertAt = lines[0]?.includes(UNCHANGED_MARKER) ? 1 : 0;
    lines.splice(insertAt, 0, ...block);
    return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Path safety
// ────────────────────────────────────────────────────────────────────────────

/** Guard against scaffolds escaping the target root (e.g. via `../`). */
export function isInside(host: PrimitiveHost, root: string, target: string): boolean {
    const rel = host.relative(root, target);
    return Boolean(rel) && !rel.startsWith('..') && !rel.startsWith('/');
}

export function assertInside(host: PrimitiveHost, root: string, target: string): void {
    if (!isInside(host, root, target)) {
        throw new Error(`Refusing to touch '${target}': outside target root '${root}'`);
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Planning & applying
// ────────────────────────────────────────────────────────────────────────────

export interface FileChange {
    /** Target-root-relative path. */
    path: string;
    /** Absolute path on disk. */
    absolute: string;
    content: string;
    action: 'create' | 'overwrite' | 'unchanged';
    /** True when the existing file carries the generated marker. */
    generated: boolean;
    /** True when an existing file is hand-written (no marker). */
    handWritten: boolean;
    /** True when the new content composes with the existing file. */
    merged?: boolean;
    /** Non-file observations raised while planning this change. */
    notices?: string[];
}

export interface PlanOptions {
    root: string;
    context: PrimitiveContext;
    instructions?: string[];
    /** `auto` (default) composes with existing files; `replace` overwrites. */
    mode?: MergeMode;
}

/** Build the list of changes a primitive would make, without writing anything. */
export function plan(
    host: PrimitiveHost,
    descriptor: PrimitiveDescriptor,
    options: PlanOptions,
): FileChange[] {
    const {root, context, instructions = [], mode = 'auto'} = options;
    const changes: FileChange[] = [];
    // `auto` composes with what is already there; `replace` regenerates the
    // descriptor's plain output. Descriptors with no `compose` hook have nothing
    // to merge with, so their output is the whole artifact either way.
    const files =
        mode === 'replace' || !descriptor.compose
            ? descriptor.files(context)
            : descriptor.compose({host, root, context});
    for (const file of files) {
        const absolute = host.join(root, file.path);
        assertInside(host, root, absolute);
        const exists = host.existsSync(absolute);
        const current = exists ? String(host.readFileSync(absolute, {encoding: 'utf-8'})) : '';
        // The generated marker is a TypeScript sentinel, so it only decides
        // ownership for code files. YAML/SQL/JSON artifacts (seeds, procedures)
        // never carry it and would otherwise never be refreshed again.
        const isCode = file.path.endsWith('.ts') || file.path.endsWith('.tsx');
        const generated = !exists || !isCode ? true : isGenerated(current);
        const content = isCode
            ? applyInstructions(withMarker(file.content), instructions)
            : file.content;
        const merged = exists && generated && mode !== 'replace' && Boolean(descriptor.compose);
        let action: FileChange['action'] = 'create';
        if (exists) action = current === content ? 'unchanged' : 'overwrite';
        changes.push({
            path: file.path,
            absolute,
            content,
            action,
            generated,
            handWritten: exists && isCode && !generated,
            merged,
            notices: file.notices,
        });
    }
    return changes;
}

/** Write planned changes. Hand-written files are never silently clobbered. */
export function apply(
    host: PrimitiveHost,
    changes: FileChange[],
    options: {force?: boolean} = {},
): {written: string[]; skipped: string[]} {
    const written: string[] = [];
    const skipped: string[] = [];
    for (const change of changes) {
        if (change.action === 'unchanged') continue;
        if (change.handWritten && !options.force) {
            skipped.push(change.path);
            continue;
        }
        host.mkdirSync?.(host.dirname(change.absolute));
        host.writeFileSync(change.absolute, change.content);
        written.push(change.path);
    }
    return {written, skipped};
}

// ────────────────────────────────────────────────────────────────────────────
// Reading & discovery
// ────────────────────────────────────────────────────────────────────────────

export interface SourceResult {
    path: string;
    source: string;
    instructions: string[];
    generated: boolean;
}

export function readSource(host: PrimitiveHost, root: string, relativePath: string): SourceResult {
    const absolute = host.join(root, relativePath);
    assertInside(host, root, absolute);
    if (!host.existsSync(absolute)) throw new Error(`'${relativePath}' not found under ${root}`);
    const source = String(host.readFileSync(absolute, {encoding: 'utf-8'}));
    return {
        path: relativePath,
        source,
        instructions: extractInstructions(source),
        generated: isGenerated(source),
    };
}

/** List files under the descriptor's roots (for `find`). */
export async function find(
    host: PrimitiveHost,
    descriptor: PrimitiveDescriptor,
    root: string,
): Promise<string[]> {
    const found: string[] = [];
    for (const searchRoot of descriptor.roots) {
        const dir = host.join(root, searchRoot);
        if (!host.existsSync(dir)) continue;
        for (const entry of await host.scan(dir)) {
            if (!entry.isFile()) continue;
            if (entry.name.startsWith('~.')) continue;
            found.push(host.join(searchRoot, entry.name));
        }
    }
    return found.sort();
}

/** Directories never worth walking when enumerating sources. */
const SKIP_DIRS = new Set([
    'node_modules',
    '.git',
    'dist',
    '.tap',
    '.rush',
    'rush-logs',
    '.playwright',
    'allure-results',
    'allure-report',
    '.kukum-test',
]);

/** Recursively list files under `dir`, skipping build output and VCS data. */
export async function walk(host: PrimitiveHost, dir: string, depth = 0): Promise<string[]> {
    if (depth > 12) return [];
    const found: string[] = [];
    let entries;
    try {
        entries = await host.scan(dir);
    } catch {
        return found;
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name) || entry.name.endsWith('-snapshots')) continue;
            found.push(...(await walk(host, host.join(dir, entry.name), depth + 1)));
        } else if (entry.isFile()) {
            found.push(host.join(dir, entry.name));
        }
    }
    return found;
}

// ────────────────────────────────────────────────────────────────────────────
// Whole-template scaffolding
// ────────────────────────────────────────────────────────────────────────────

export interface TemplateOptions {
    /** Directory holding the template tree. */
    templateRoot: string;
    /** Destination root. */
    root: string;
    subject: string;
    object: string;
    /** Paths (relative, `/`-separated) to skip, in addition to VCS/build output. */
    ignore?: string[];
    instructions?: string[];
}

const templateTokens = (value: string, subject: string, object: string): string =>
    value
        .replaceAll('$subject', subject)
        .replaceAll('$Subject', capitalize(subject))
        .replaceAll('$object', object)
        .replaceAll('$Object', capitalize(object));

/**
 * Plan a scaffold from a whole directory template (the `blong-kopi` realm
 * template), mirroring `createRealm`: tokens are substituted in both paths and
 * contents, every `.ts` file is stamped with the generated marker, and
 * `package.json` is written separately with only the package name replaced.
 */
export async function planTemplate(
    host: PrimitiveHost,
    options: TemplateOptions,
): Promise<FileChange[]> {
    const {templateRoot, root, subject, object} = options;
    const ignore = new Set(['kopi.ts', 'README.md', 'CHANGELOG.md', ...(options.ignore ?? [])]);
    const files = await walk(host, templateRoot);
    const changes: FileChange[] = [];

    const add = (targetPath: string, content: string, handWrittenCheck = true): void => {
        const absolute = host.join(root, targetPath);
        assertInside(host, root, absolute);
        const exists = host.existsSync(absolute);
        const current = exists ? String(host.readFileSync(absolute, {encoding: 'utf-8'})) : '';
        const generated = exists ? isGenerated(current) : true;
        let action: FileChange['action'] = 'create';
        if (exists) action = current === content ? 'unchanged' : 'overwrite';
        changes.push({
            path: targetPath,
            absolute,
            content,
            action,
            generated,
            handWritten: exists && !generated && handWrittenCheck,
        });
    };

    for (const file of files) {
        const relativePath = host.relative(templateRoot, file);
        const name = host.basename(relativePath);
        if (ignore.has(name)) continue;
        if (relativePath === 'package.json') continue; // written below
        const raw = String(host.readFileSync(file, {encoding: 'utf-8'}));
        const target = templateTokens(relativePath, subject, object);
        const content = target.endsWith('.ts')
            ? applyInstructions(
                  withMarker(templateTokens(raw, subject, object)),
                  options.instructions ?? [],
              )
            : templateTokens(raw, subject, object);
        add(target, content);
    }

    const pkgPath = host.join(templateRoot, 'package.json');
    if (host.existsSync(pkgPath)) {
        const pkg = String(host.readFileSync(pkgPath, {encoding: 'utf-8'})).replace(
            /"name"\s*:\s*"[^"]*"/,
            `"name": "${subject}"`,
        );
        add('package.json', pkg, true);
    }

    return changes;
}
