// cspell:ignore FTDQ
import {execFile} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

/**
 * The `@@` cross-reference feature: hover a token in a source file, a doc page or a
 * skill, and see the memory entry or page it names; click it to open; F12 to jump to
 * the entry's own line.
 *
 * The markdown stays the source of truth. This reads a derived JSON index —
 * `blong-dev memory export --json` — so the editor never parses or writes the memory
 * files. It is the same grammar the `refs` linter checks, so a token that resolves
 * here is one that resolves there.
 *
 * A token is a link to the **real** document it names — the memory file at the
 * entry's line, or the page at the section — so Ctrl+click opens what the reader
 * wants, not a rendered copy.
 */

/**
 * The token grammar, identical to `blong-dev`'s `REFERENCE` in `memoryTypes.ts`.
 *
 * Named groups are used on purpose: the positional form was mis-counted once (the
 * page name landed in the anchor group), so the names are the contract. The id prefix class is
 * every kind's — friction, todo, decision and faq — because a `@@Q-…` that this pattern does not
 * see is a token the linter checks and the editor silently refuses to link.
 */
export const REFERENCE_RE =
    /@@(?:(?<id>[FTDQ]-\d{3,})|doc:(?<docTier>[a-z0-9-]+)\/(?<docName>[a-z0-9.-]+)(?:#(?<docAnchor>[a-z0-9-]+))?|skill:(?<skillName>[a-z0-9-]+)(?:#(?<skillAnchor>[a-z0-9-]+))?)/g;

interface IEntryRecord {
    title: string;
    area: string;
    status: string;
    date: string;
    body: string;
    file: string;
    line: number;
    /** The successor a superseded decision names, so the hover can point at it. */
    successor?: string;
    alsoIn?: string[];
}

interface IPageRecord {
    title: string;
    tier?: string;
    file: string;
    anchors: Record<string, number>;
}

/** The shape of `blong-dev memory export --json`. */
export interface IMemoryIndex {
    version?: number;
    entries: Record<string, IEntryRecord>;
    retired?: Record<string, {fate: string; file: string; successor?: string}>;
    docs: Record<string, IPageRecord>;
    skills: Record<string, IPageRecord>;
}

/** A reference token, resolved against the index to the real document it names. */
interface IToken {
    range: vscode.Range;
    raw: string;
    /** Where the token points, when it resolves to a document. */
    location?: vscode.Location;
    /** What the hover shows: the target's title, line and a short excerpt. */
    hover: vscode.MarkdownString;
}

let cached: {index: IMemoryIndex; root: string} | null | undefined;

/**
 * Languages whose backticks mean "this is an example".
 *
 * Only a markdown document uses a backtick to quote a token rather than to format a word, so only
 * there does a code span make a reference an illustration. In a TypeScript comment the same
 * backticks are ordinary prose punctuation, and skipping them used to hide most of the references
 * in the tree from both this provider and the `refs` linter (@@F-867 @@D-1042).
 */
const MARKDOWN_LANGUAGES = new Set(['markdown', 'mdx']);

/** The workspace root the index is relative to. */
function workspaceRoot(): string | null {
    const folders = vscode.workspace.workspaceFolders ?? [];
    // The index is a repository artefact, so the folder that holds the memory tree is the one to
    // export from — not whichever folder the editor happens to list first in a multi-root workspace.
    const owner = folders.find(folder =>
        fs.existsSync(path.join(folder.uri.fsPath, '.github', 'memory')),
    );
    if (owner) {
        return owner.uri.fsPath;
    }
    const repository = folders.find(folder =>
        fs.existsSync(path.join(folder.uri.fsPath, 'rush.json')),
    );
    return (repository ?? folders[0])?.uri.fsPath ?? null;
}

/** Run `blong-dev memory export --json`, resolving to the parsed index or null. */
function exportFromCli(root: string): Promise<IMemoryIndex | null> {
    return new Promise(resolve => {
        execFile(
            'blong-dev',
            ['memory', 'export', '--json'],
            {cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 30_000},
            (error, stdout) => {
                if (error || !stdout) {
                    resolve(null);
                    return;
                }
                try {
                    resolve(JSON.parse(stdout) as IMemoryIndex);
                } catch {
                    resolve(null);
                }
            },
        );
    });
}

/** The reference index, loaded once and remembered. */
async function getIndex(): Promise<{index: IMemoryIndex; root: string} | null> {
    if (cached !== undefined) {
        return cached;
    }
    const root = workspaceRoot();
    if (!root) {
        cached = null;
        return null;
    }
    const override = process.env.BLONG_MEMORY_INDEX;
    const fromOverride = override
        ? (() => {
              try {
                  return JSON.parse(fs.readFileSync(override, 'utf8')) as IMemoryIndex;
              } catch {
                  return null;
              }
          })()
        : null;
    const index = fromOverride ?? (await exportFromCli(root));
    cached = index ? {index, root} : null;
    if (!index) {
        vscode.window.setStatusBarMessage(
            'memory: no reference index — run `blong-dev memory export --out .github/memory/references.json`',
            8000,
        );
    }
    return cached;
}

/** Drop the cached index so the next hover reloads it. */
export function invalidateMemoryIndex(): void {
    cached = undefined;
}

/** True when a character offset is inside a backtick span on its line. */
export function insideCodeSpan(line: string, column: number): boolean {
    return (line.slice(0, column).match(/`/g) ?? []).length % 2 === 1;
}

/** A line that opens or closes a fenced code block. */
export const FENCE = /^\s*(?:```|~~~)/;

/** True when a document's language quotes examples in backticks, as markdown does. */
export function isMarkdown(languageId: string): boolean {
    return MARKDOWN_LANGUAGES.has(languageId);
}

/** A file URI positioned at a 1-based line, so `open` lands on the target. */
function fileAt(root: string, file: string, line: number): vscode.Uri {
    return vscode.Uri.file(path.join(root, file)).with({fragment: `L${Math.max(1, line)}`});
}

/** Resolve a parsed token to the document it names, or a hover that explains the miss. */
function resolveToken(
    groups: Record<string, string | undefined>,
    index: IMemoryIndex,
    root: string,
): {location?: vscode.Location; hover: vscode.MarkdownString} {
    const {id, docTier, docName, docAnchor, skillName, skillAnchor} = groups;

    if (id) {
        const key = id.toUpperCase();
        const entry = index.entries[key];
        if (entry) {
            const excerpt = entry.body.split(/\n\s*\n/)[0] ?? '';
            const also = entry.alsoIn?.length ? `\n\n_also in:_ ${entry.alsoIn.join(', ')}` : '';
            // A superseded decision is shown with where its reasoning went, because that is the
            // entry a reader should be reading instead.
            const moved =
                entry.status === 'superseded' && entry.successor
                    ? `\n\n_The reasoning moved to_ \`${entry.successor}\`.`
                    : entry.status === 'superseded'
                      ? '\n\n_No successor is recorded._'
                      : '';
            const uri = fileAt(root, entry.file, entry.line);
            return {
                location: new vscode.Location(
                    uri,
                    new vscode.Position(Math.max(0, entry.line - 1), 0),
                ),
                hover: new vscode.MarkdownString(
                    `**${key}** — ${entry.title}\n\n_${entry.date} · ${entry.area} · ${entry.status}_${moved}\n\n${excerpt}${also}\n\n\`${entry.file}:${entry.line}\`\n\n[open](${uri})`,
                ),
            };
        }
        const retired = index.retired?.[key];
        if (retired) {
            return {hover: new vscode.MarkdownString(`**${key}** — retired\n\n${retired.fate}`)};
        }
        return {
            hover: new vscode.MarkdownString(
                `**${key}** — unknown id\n\nRun \`blong-dev memory refs --dangling\`.`,
            ),
        };
    }

    const isDoc = Boolean(docTier && docName);
    const key = isDoc ? `${docTier}/${docName}` : (skillName ?? '');
    const anchor = isDoc ? docAnchor : skillAnchor;
    const page = isDoc ? index.docs[key] : index.skills[key];
    if (!page) {
        return {
            hover: new vscode.MarkdownString(`\`${key}\` — unknown ${isDoc ? 'page' : 'skill'}`),
        };
    }
    if (anchor && !(anchor in page.anchors)) {
        return {hover: new vscode.MarkdownString(`${page.title} has no section \`#${anchor}\``)};
    }
    const line = anchor ? (page.anchors[anchor] ?? 1) : 1;
    const uri = fileAt(root, page.file, line);
    return {
        location: new vscode.Location(uri, new vscode.Position(Math.max(0, line - 1), 0)),
        hover: new vscode.MarkdownString(
            `**${page.title}**${anchor ? ` → \`#${anchor}\`` : ''}\n\n\`${page.file}:${line}\`\n\n[open](${uri})`,
        ),
    };
}

/**
 * Every reference token in a document, resolved to the document it names.
 *
 * Code formatting means "example" in a markdown document only: there a fenced block and an inline
 * code span quote the syntax, and a token inside one is read as an illustration. Everywhere else a
 * token is a reference, which is what makes the providers agree with the `refs` linter — it scopes
 * the same rule to markdown for the same reason (@@D-1042).
 *
 * A markdown token in code formatting is not dropped outright: it is kept when it actually
 * **resolves**, because a doc page that writes a real id in backticks still means that entry, and
 * only a made-up id or page is an illustration. The linter cannot make that distinction — it would
 * have to resolve every example — so it skips them all, and this is the one place the editor is
 * deliberately more generous.
 */
function tokensIn(document: vscode.TextDocument, index: IMemoryIndex, root: string): IToken[] {
    const found: IToken[] = [];
    const markdown = MARKDOWN_LANGUAGES.has(document.languageId);
    let fenced = false;
    for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
        const line = document.lineAt(lineNumber).text;
        if (markdown && FENCE.test(line)) {
            fenced = !fenced;
            continue;
        }
        REFERENCE_RE.lastIndex = 0;
        for (const match of line.matchAll(REFERENCE_RE)) {
            const column = match.index ?? 0;
            const quoted = markdown && (fenced || insideCodeSpan(line, column));
            const groups = match.groups;
            if (!groups) {
                continue;
            }
            const {location, hover} = resolveToken(groups, index, root);
            if (quoted && !location) {
                continue;
            }
            found.push({
                range: new vscode.Range(lineNumber, column, lineNumber, column + match[0].length),
                raw: match[0],
                ...(location ? {location} : {}),
                hover,
            });
        }
    }
    return found;
}

/**
 * A token found in a terminal line, or any other text the editor did not hand over as a document.
 *
 * The provider can only report an offset and a length, so the match is the one thing carried out of
 * it and the resolution happens when the link is followed.
 */
export interface IReferenceMatch {
    startIndex: number;
    length: number;
    raw: string;
}

/** Every `@@` token in one line, in order. */
export function referenceTokensIn(line: string): IReferenceMatch[] {
    // A fresh pattern per call: `REFERENCE_RE` is stateful because it is global, and a terminal
    // provider and a document provider share it on the same tick.
    const pattern = new RegExp(REFERENCE_RE.source, 'g');
    return Array.from(line.matchAll(pattern), match => ({
        startIndex: match.index ?? 0,
        length: match[0].length,
        raw: match[0],
    }));
}

/**
 * The id an index line names, when the line is one the memory CLI prints.
 *
 * Two shapes carry an id to a terminal reader. `blong-dev memory list` writes
 * `# T-058 open · cross-cutting — title (path)`, and the generated index writes
 * `- \`T-716\` · area — title`: markdown's backticked form, not an `@@` token. Neither carries a
 * `@@`, so a terminal has nothing to click unless the line's own shape is recognised. Both shapes
 * are narrow — a `#` heading that opens with an id, or a list item whose first cell is a backticked
 * id — and the link is built as the token the resolver understands.
 */
const CLI_LIST_RE = /^#\s+([FTDQ]-\d{3,})\b/;
const INDEX_LIST_RE = /^\s*-\s+`([FTDQ]-\d{3,})`/;

/** The id an index line names, and where it starts, or `undefined` when the line is not one. */
export function indexLineId(line: string): {id: string; start: number} | undefined {
    const match = CLI_LIST_RE.exec(line) ?? INDEX_LIST_RE.exec(line);
    const id = match?.[1];
    if (!id) {
        return undefined;
    }
    return {id, start: line.indexOf(id)};
}

/**
 * The document one `@@` token names, or `undefined` when the index is unavailable or the token does
 * not resolve.
 *
 * This is the terminal's side of the same resolver the hover uses, so a token clicked in a terminal
 * and the same token hovered in a file land on the same line.
 */
export async function locateReference(raw: string): Promise<vscode.Location | undefined> {
    const loaded = await getIndex();
    if (!loaded) {
        return undefined;
    }
    const pattern = new RegExp(REFERENCE_RE.source, 'g');
    const match = pattern.exec(raw);
    if (!match?.groups) {
        return undefined;
    }
    return resolveToken(match.groups, loaded.index, loaded.root).location;
}

/** Register the providers that make `@@` tokens navigable. */
export function registerMemoryReferences(context: vscode.ExtensionContext): void {
    const linkProvider = vscode.languages.registerDocumentLinkProvider(
        {scheme: '*'},
        {
            async provideDocumentLinks(
                document: vscode.TextDocument,
            ): Promise<vscode.DocumentLink[]> {
                const loaded = await getIndex();
                if (!loaded) {
                    return [];
                }
                return tokensIn(document, loaded.index, loaded.root)
                    .filter(token => token.location)
                    .map(token => {
                        const link = new vscode.DocumentLink(token.range, token.location!.uri);
                        link.tooltip = 'Open the referenced document';
                        return link;
                    });
            },
        },
    );

    const hoverProvider = vscode.languages.registerHoverProvider(
        {scheme: '*'},
        {
            async provideHover(
                document: vscode.TextDocument,
                position: vscode.Position,
            ): Promise<vscode.Hover | undefined> {
                const loaded = await getIndex();
                if (!loaded) {
                    return undefined;
                }
                const token = tokensIn(document, loaded.index, loaded.root).find(candidate =>
                    candidate.range.contains(position),
                );
                if (!token) {
                    return undefined;
                }
                return new vscode.Hover(token.hover, token.range);
            },
        },
    );

    const definitionProvider = vscode.languages.registerDefinitionProvider(
        {scheme: '*'},
        {
            async provideDefinition(
                document: vscode.TextDocument,
                position: vscode.Position,
            ): Promise<vscode.Definition | undefined> {
                const loaded = await getIndex();
                if (!loaded) {
                    return undefined;
                }
                const token = tokensIn(document, loaded.index, loaded.root).find(candidate =>
                    candidate.range.contains(position),
                );
                return token?.location;
            },
        },
    );

    // The index is derived, so a memory write makes it stale — reload on demand.
    const watcher = vscode.workspace.createFileSystemWatcher('**/.github/memory/*.md');
    const invalidate = () => invalidateMemoryIndex();
    watcher.onDidChange(invalidate);
    watcher.onDidCreate(invalidate);
    watcher.onDidDelete(invalidate);

    context.subscriptions.push(linkProvider, hoverProvider, definitionProvider, watcher);
}
