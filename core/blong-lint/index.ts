import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * Structured lint diagnostics for Blong packages.
 *
 * This module is the reusable core of `blong-dev lint` (which keeps its
 * print-and-exit CLI behaviour) and is also importable by the runtime so that
 * `blong-kukum` can report tsc / cspell / eslint problems back to an API caller
 * after it scaffolds or edits source.
 *
 * It intentionally shells out to the same three tools the CLI uses — there is
 * no second, drifting implementation of "what lint means" in the monorepo.
 */

export type LintTool = 'tsc' | 'cspell' | 'eslint';

export interface Diagnostic {
    /** Which tool produced the diagnostic. */
    tool: LintTool;
    severity: 'error' | 'warning';
    /** Absolute or cwd-relative path, as reported by the tool. */
    file?: string;
    line?: number;
    column?: number;
    message: string;
    /** ESLint rule id / cspell issue type / tsc code (e.g. `TS2345`). */
    rule?: string;
}

export interface LintCollectOptions {
    /**
     * Files to check, relative to `cwd`. When omitted, every tool runs with its
     * default (whole-package) scope.
     */
    files?: string[];
    /**
     * `changed` (default) scopes cspell/eslint to {@link files} while tsc still
     * type-checks the whole package (individual files break tsconfig
     * inheritance and cross-file resolution). `package` ignores `files` and
     * runs every tool over the package.
     */
    scope?: 'changed' | 'package';
    /** Restrict which tools run. Defaults to all three (when applicable). */
    tools?: LintTool[];
    /** Extra `node_modules/.bin` directories, searched before the defaults. */
    binPaths?: string[];
    /** Per-tool timeout in milliseconds. Defaults to 180000. */
    timeoutMs?: number;
    /** Explicit cspell config path (otherwise discovered by walking up). */
    cspellConfig?: string;
}

export interface LintResult {
    diagnostics: Diagnostic[];
    /** 0 when every tool exited cleanly. */
    exitCode: number;
    /** Tools that actually ran, in execution order. */
    ran: LintTool[];
}

const TS_EXT = /\.[cm]?tsx?$/i;
const SPELL_EXT = /\.([cm]?tsx?|md)$/i;
const LINT_EXT = /\.[cm]?[jt]sx?$/i;
const PATH_SEP = process.platform === 'win32' ? ';' : ':';
const DEFAULT_TIMEOUT = 180_000;

/** `node_modules/.bin` of this package — owns the pinned tool versions. */
const ownBin = fileURLToPath(new URL('./node_modules/.bin', import.meta.url));

interface RunResult {
    code: number;
    stdout: string;
    stderr: string;
}

/** `node_modules/.bin` directories from `startDir` up to the filesystem root. */
function* walkUpBin(startDir: string): Generator<string> {
    let dir = startDir;
    for (;;) {
        const bin = join(dir, 'node_modules', '.bin');
        if (existsSync(bin)) yield bin;
        const parent = dirname(dir);
        if (parent === dir) return;
        dir = parent;
    }
}

function resolveBin(tool: LintTool, cwd: string, extra: string[]): string | undefined {
    const exe = process.platform === 'win32' ? `${tool}.cmd` : tool;
    for (const dir of [...extra, ownBin, ...walkUpBin(cwd)]) {
        const candidate = join(dir, exe);
        if (existsSync(candidate)) return candidate;
    }
    return undefined;
}

function run(
    command: string,
    args: string[],
    cwd: string,
    timeoutMs: number,
    env: NodeJS.ProcessEnv,
): Promise<RunResult> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {cwd, env, stdio: ['ignore', 'pipe', 'pipe']});
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
            child.kill('SIGKILL');
        }, timeoutMs);
        child.stdout?.on('data', chunk => (stdout += String(chunk)));
        child.stderr?.on('data', chunk => (stderr += String(chunk)));
        child.on('error', error => {
            clearTimeout(timer);
            reject(error);
        });
        child.on('close', code => {
            clearTimeout(timer);
            resolve({code: code ?? 0, stdout, stderr});
        });
    });
}

/** Tolerant JSON parse: tolerates leading/trailing chatter on the stream. */
function parseJson(text: string): unknown {
    const trimmed = text.trim();
    if (!trimmed) return undefined;
    try {
        return JSON.parse(trimmed);
    } catch {
        // fall through to bracket extraction
    }
    for (const open of ['[', '{']) {
        const start = trimmed.indexOf(open);
        if (start < 0) continue;
        const close = open === '[' ? ']' : '}';
        const end = trimmed.lastIndexOf(close);
        if (end <= start) continue;
        try {
            return JSON.parse(trimmed.slice(start, end + 1));
        } catch {
            // try the next bracket flavour
        }
    }
    return undefined;
}

function hasTsConfig(dir: string): boolean {
    return existsSync(join(dir, 'tsconfig.json'));
}

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

function hasEslintConfig(dir: string): boolean {
    return ESLINT_CONFIG_FILES.some(file => existsSync(join(dir, file)));
}

function findUp(startDir: string, filename: string): string | undefined {
    let dir = startDir;
    for (;;) {
        const candidate = join(dir, filename);
        if (existsSync(candidate)) return candidate;
        const parent = dirname(dir);
        if (parent === dir) return undefined;
        dir = parent;
    }
}

/** Parse `path(line,col): error TS1234: message` lines from `tsc --pretty false`. */
function parseTsc(stdout: string): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const withLocation = /^(.+?)\((\d+),(\d+)\): (error|warning) (TS\d+): (.*)$/gm;
    for (const match of stdout.matchAll(withLocation)) {
        diagnostics.push({
            tool: 'tsc',
            severity: match[4] === 'warning' ? 'warning' : 'error',
            file: match[1],
            line: Number(match[2]),
            column: Number(match[3]),
            rule: match[5],
            message: match[6].trim(),
        });
    }
    const withoutLocation = /^(error|warning) (TS\d+): (.*)$/gm;
    for (const match of stdout.matchAll(withoutLocation)) {
        diagnostics.push({
            tool: 'tsc',
            severity: match[1] === 'warning' ? 'warning' : 'error',
            rule: match[2],
            message: match[3].trim(),
        });
    }
    return diagnostics;
}

interface CspellIssue {
    line?: number;
    column?: number;
    text?: string;
    message?: string;
    severity?: string;
}

/** `path:line:col - message` — cspell's default (non-JSON) reporter format. */
const CSPELL_LINE = /^(.*?):(\d+):(\d+)\s+-\s+(.*)$/;

function parseCspell(stdout: string): Diagnostic[] {
    const raw = parseJson(stdout);
    if (raw) return parseCspellJson(raw);
    const diagnostics: Diagnostic[] = [];
    for (const line of stdout.split(/\r?\n/)) {
        const match = CSPELL_LINE.exec(line.trim());
        if (!match) continue;
        diagnostics.push({
            tool: 'cspell',
            severity: 'error',
            file: match[1],
            line: Number(match[2]),
            column: Number(match[3]),
            message: match[4].trim(),
        });
    }
    return diagnostics;
}

function parseCspellJson(raw: unknown): Diagnostic[] {
    const entries: unknown[] = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as {issues?: unknown[]}).issues)
          ? (raw as {issues: unknown[]}).issues
          : Array.isArray((raw as {errors?: unknown[]}).errors)
            ? (raw as {errors: unknown[]}).errors
            : [];
    const diagnostics: Diagnostic[] = [];
    for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const record = entry as {file?: string; uri?: string; errors?: CspellIssue[]} & CspellIssue;
        const file = record.file ?? record.uri;
        const issues = Array.isArray(record.errors) ? record.errors : [record];
        for (const issue of issues) {
            const message = issue.text ?? issue.message;
            if (!message) continue;
            diagnostics.push({
                tool: 'cspell',
                severity: 'error',
                file,
                line: issue.line,
                column: issue.column,
                message: String(message).trim(),
                rule: issue.severity,
            });
        }
    }
    return diagnostics;
}

interface EslintMessage {
    line?: number;
    column?: number;
    severity?: number;
    message?: string;
    ruleId?: string | null;
}

function parseEslint(stdout: string): Diagnostic[] {
    const raw = parseJson(stdout);
    if (!Array.isArray(raw)) return [];
    const diagnostics: Diagnostic[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const record = entry as {filePath?: string; messages?: EslintMessage[]};
        for (const message of record.messages ?? []) {
            diagnostics.push({
                tool: 'eslint',
                severity: message.severity === 1 ? 'warning' : 'error',
                file: record.filePath,
                line: message.line,
                column: message.column,
                rule: message.ruleId ?? undefined,
                message: message.message ?? 'eslint problem',
            });
        }
    }
    return diagnostics;
}

/**
 * Run tsc / cspell / eslint over `cwd` and return structured diagnostics.
 *
 * Never calls `process.exit` — callers decide what to do with {@link LintResult.exitCode}.
 * Tools that cannot be resolved are skipped rather than failing the run.
 */
export async function lintCollect(
    cwd: string,
    options: LintCollectOptions = {},
): Promise<LintResult> {
    const scope = options.scope ?? (options.files?.length ? 'changed' : 'package');
    const staged = scope === 'changed';
    const files = options.files ?? [];
    const enabled = new Set<LintTool>(options.tools ?? ['tsc', 'cspell', 'eslint']);
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
    const binPaths = options.binPaths ?? [];

    const tsFiles = files.filter(file => TS_EXT.test(file));
    const spellFiles = files.filter(file => SPELL_EXT.test(file));
    const lintFiles = files.filter(file => LINT_EXT.test(file));

    const env: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: [ownBin, join(cwd, 'node_modules', '.bin'), process.env['PATH'] ?? ''].join(PATH_SEP),
    };

    const diagnostics: Diagnostic[] = [];
    const ran: LintTool[] = [];
    let exitCode = 0;

    const failure = async (tool: LintTool, args: string[]): Promise<RunResult | undefined> => {
        const bin = resolveBin(tool, cwd, binPaths);
        if (!bin) return undefined;
        ran.push(tool);
        const result = await run(bin, args, cwd, timeoutMs, env);
        if (result.code !== 0) exitCode = 1;
        return result;
    };

    // ── tsc ──────────────────────────────────────────────────────────────────
    // Always the full package: passing individual files breaks tsconfig
    // inheritance and cross-file type resolution.
    if (enabled.has('tsc') && hasTsConfig(cwd) && (!staged || tsFiles.length > 0)) {
        const result = await failure('tsc', ['--noEmit', '--pretty', 'false']);
        if (result) diagnostics.push(...parseTsc(result.stdout + '\n' + result.stderr));
    }

    // ── cspell ───────────────────────────────────────────────────────────────
    if (enabled.has('cspell')) {
        const cspellConfig = options.cspellConfig ?? findUp(cwd, 'cspell.config.yaml');
        const targets = spellFiles.length > 0 ? spellFiles : ['**/*.ts', '**/*.tsx', '**/*.md'];
        if (!staged || spellFiles.length > 0) {
            const args = ['--no-progress', '--no-summary', '--no-must-find-files'];
            if (cspellConfig) args.push('--config', cspellConfig);
            args.push(...targets);
            const result = await failure('cspell', args);
            if (result) diagnostics.push(...parseCspell(result.stdout));
        }
    }

    // ── eslint ───────────────────────────────────────────────────────────────
    if (enabled.has('eslint') && hasEslintConfig(cwd)) {
        const targets = staged ? lintFiles : ['.'];
        if (targets.length > 0) {
            const result = await failure('eslint', [
                '--max-warnings',
                '0',
                '-f',
                'json',
                ...targets,
            ]);
            if (result) diagnostics.push(...parseEslint(result.stdout));
        }
    }

    return {diagnostics, exitCode, ran};
}

/** Convenience: true when {@link lintCollect} found neither errors nor warnings. */
export function hasProblems(result: LintResult): boolean {
    return result.diagnostics.length > 0 || result.exitCode !== 0;
}

/**
 * One diagnostic as a single terminal line.
 *
 * A rendering of {@link Diagnostic}, so it belongs beside the type — and both
 * `blong-dev lint` and this package's own `bin/lint.ts` need it.
 */
export function formatDiagnostic(diagnostic: Diagnostic): string {
    const location =
        diagnostic.file == null
            ? ''
            : `${diagnostic.file}${diagnostic.line == null ? '' : `:${diagnostic.line}`}${
                  diagnostic.column == null ? '' : `:${diagnostic.column}`
              }  `;
    const rule = diagnostic.rule ? ` [${diagnostic.rule}]` : '';
    const mark = diagnostic.severity === 'warning' ? '⚠' : '✖';
    return `  ${mark} ${location}${diagnostic.tool}${rule}: ${diagnostic.message}`;
}
