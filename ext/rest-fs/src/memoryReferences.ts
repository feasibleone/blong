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
 * page name landed in the anchor group), so the names are the contract.
 */
export const REFERENCE_RE =
    /@@(?:(?<id>[FTD]-\d{3})|doc:(?<docTier>[a-z0-9-]+)\/(?<docName>[a-z0-9.-]+)(?:#(?<docAnchor>[a-z0-9-]+))?|skill:(?<skillName>[a-z0-9-]+)(?:#(?<skillAnchor>[a-z0-9-]+))?)/g;

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

/** The workspace root the index is relative to. */
function workspaceRoot(): string | null {
    const folder = vscode.workspace.workspaceFolders?.[0];
    return folder ? folder.uri.fsPath : null;
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
function insideCodeSpan(line: string, column: number): boolean {
    return (line.slice(0, column).match(/`/g) ?? []).length % 2 === 1;
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

/** Every reference token in a document, resolved to the document it names. */
function tokensIn(document: vscode.TextDocument, index: IMemoryIndex, root: string): IToken[] {
    const found: IToken[] = [];
    for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
        const line = document.lineAt(lineNumber).text;
        REFERENCE_RE.lastIndex = 0;
        for (const match of line.matchAll(REFERENCE_RE)) {
            const column = match.index ?? 0;
            if (insideCodeSpan(line, column)) {
                continue;
            }
            const groups = match.groups;
            if (!groups) {
                continue;
            }
            const {location, hover} = resolveToken(groups, index, root);
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
