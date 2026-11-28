import * as vscode from 'vscode';
import {
    cachePathOf,
    entryText,
    invalidateStoreScan,
    KIND_BY_SEGMENT,
    LOG_REFERENCE_RE,
    missingEntry,
    PARENT_REFERENCE_RE,
    readEntry,
    referenceUri,
    scanStore,
    traceListing,
} from './logReferences';
import {
    FENCE,
    indexLineId,
    insideCodeSpan,
    isMarkdown,
    locateReference,
    referenceTokensIn,
    registerMemoryReferences,
} from './memoryReferences';
import {RestFileSystemProvider} from './restFileSystemProvider';
import {RestShellTaskProvider} from './restShellTaskProvider';

type RestFsWorkspaceConfig = Record<
    string,
    {
        baseUrl: string;
        headers?: Record<string, string>;
    }
>;

/**
 * A terminal link, carrying either a log reference or a memory token.
 *
 * A terminal line prints both kinds of thing — a `lukaot` reference group after a record, and a
 * `@@` token in anything the dev CLI echoes back — and neither is a URL the terminal resolves on
 * its own, so the provider reports each one with the text to resolve rather than a position only.
 */
interface IReferenceTerminalLink extends vscode.TerminalLink {
    /** The `lukaot://` reference to open, when the link names a log entry, trace or payload. */
    reference?: string;
    /** The `@@` token to resolve, when the link names a memory entry, a doc page or a skill. */
    memory?: string;
}

/** Every link a terminal line carries, in the order they appear. */
function terminalLinks(line: string): IReferenceTerminalLink[] {
    const links: IReferenceTerminalLink[] = [];
    const references = new RegExp(LOG_REFERENCE_RE.source, 'g');
    for (const match of line.matchAll(references)) {
        const kind = KIND_BY_SEGMENT[match[1] ?? ''];
        links.push({
            startIndex: match.index ?? 0,
            length: match[0].length,
            tooltip: `Open this ${kind ?? 'log'} reference`,
            reference: match[0],
        });
    }
    const parents = new RegExp(PARENT_REFERENCE_RE.source, 'g');
    for (const match of line.matchAll(parents)) {
        links.push({
            startIndex: match.index ?? 0,
            length: match[0].length,
            tooltip: 'Open the record that caused this one',
            reference: referenceUri('record', match[1] ?? ''),
        });
    }
    for (const token of referenceTokensIn(line)) {
        links.push({
            startIndex: token.startIndex,
            length: token.length,
            tooltip: 'Open the memory entry, page or skill this names',
            memory: token.raw,
        });
    }
    const indexId = indexLineId(line);
    if (indexId) {
        links.push({
            startIndex: indexId.start,
            length: indexId.id.length,
            tooltip: 'Open this memory entry',
            memory: `@@${indexId.id}`,
        });
    }
    return links.sort((left, right) => left.startIndex - right.startIndex);
}

/**
 * Show one resolved reference.
 *
 * The URI is resolved by the `lukaot` content provider, so this opens it the same way whether the
 * click came from a terminal link or from a reference quoted in a file.
 */
async function openReference(reference: string): Promise<void> {
    try {
        const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(reference));
        await vscode.window.showTextDocument(document, {preview: true});
    } catch (error) {
        vscode.window.showWarningMessage(`Could not open ${reference}: ${error}`);
    }
}

/** Show the document a memory token names, at the entry's own line. */
async function openMemoryToken(raw: string): Promise<void> {
    const location = await locateReference(raw);
    if (!location) {
        vscode.window.showWarningMessage(
            `${raw} does not resolve — run \`blong-dev memory refs --dangling\``,
        );
        return;
    }
    const document = await vscode.workspace.openTextDocument(location.uri);
    await vscode.window.showTextDocument(document, {selection: location.range, preview: true});
}

/**
 * This method is called when your extension is activated
 * The extension is activated when a file with the restfs:// scheme is accessed
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('REST Filesystem extension is now active!');

    // Get configuration for the REST API endpoint
    const config = vscode.workspace.getConfiguration('restfs');

    const workspaceConfig = config.get<RestFsWorkspaceConfig>(
        'workspace',
        {} as RestFsWorkspaceConfig,
    );

    // Create and register the filesystem provider
    const restFs = new RestFileSystemProvider(workspaceConfig);

    // Register the filesystem provider for the 'restfs' scheme
    const provider = vscode.workspace.registerFileSystemProvider('restfs', restFs, {
        isCaseSensitive: true,
    });

    vscode.window.registerUriHandler({
        handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
            console.log(`Handling URI: ${uri.toString()}`);
            vscode.commands.executeCommand(
                'vscode.openFolder',
                vscode.Uri.parse(`restfs:/${uri.path}`),
                {
                    forceNewWindow: true,
                },
            );
        },
    });

    context.subscriptions.push(provider);

    // Register command to open REST filesystem workspace
    const openWorkspaceCommand = vscode.commands.registerCommand(
        'restfs.openWorkspace',
        async () => {
            const workspace = await vscode.window.showQuickPick(
                Object.keys(config.get<Record<string, any>>('workspace', {})),
                {
                    placeHolder: 'Select REST FS workspace to open',
                },
            );
            const uri = vscode.Uri.parse(`restfs://${workspace}/`);
            try {
                await vscode.commands.executeCommand('vscode.openFolder', uri, {
                    forceNewWindow: false,
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open REST filesystem: ${error}`);
            }
        },
    );

    context.subscriptions.push(openWorkspaceCommand);

    // Register command to configure REST endpoint
    const configureCommand = vscode.commands.registerCommand('restfs.configure', async () => {
        const workspace = await vscode.window.showQuickPick(
            Object.keys(config.get<Record<string, any>>('workspace', {})),
            {
                placeHolder: 'Select REST FS workspace to configure',
            },
        );
        if (!workspace) {
            return;
        }
        const baseUrl = await vscode.window.showInputBox({
            prompt: 'Enter REST API base URL',
            value: config.get<string>(
                `workspace.${workspace}.baseUrl`,
                'http://localhost:3000/api/fs',
            ),
            placeHolder: 'http://localhost:3000/api/fs',
        });
        if (!baseUrl) {
            return;
        }
        const userName = await vscode.window.showInputBox({
            prompt: 'Enter Username (leave blank if not required)',
            value:
                Buffer.from(
                    config
                        .get<string>(`workspace.${workspace}.headers.Authorization`, '')
                        .split(' ')[1] || '',
                    'base64',
                )
                    .toString('utf-8')
                    .split(':')[0] || '',
            placeHolder: 'Username for Basic Auth',
        });
        const password = await vscode.window.showInputBox({
            prompt: 'Enter Password (leave blank if not required)',
            value:
                Buffer.from(
                    config
                        .get<string>(`workspace.${workspace}.headers.Authorization`, '')
                        .split(' ')[1] || '',
                    'base64',
                )
                    .toString('utf-8')
                    .split(':')[1] || '',
            password: true,
            placeHolder: 'Password for Basic Auth',
        });

        if (baseUrl) {
            await config.update(
                `workspace.${workspace}.baseUrl`,
                baseUrl,
                vscode.ConfigurationTarget.Global,
            );
            vscode.window.showInformationMessage(
                'REST filesystem configuration updated. Reload window for changes to take effect.',
            );
        }
        if (userName || password) {
            await config.update(
                `workspace.${workspace}.headers.Authorization`,
                `Basic ${Buffer.from(`${userName}:${password}`).toString('base64')}`,
                vscode.ConfigurationTarget.Global,
            );
            vscode.window.showInformationMessage(
                'REST filesystem configuration updated. Reload window for changes to take effect.',
            );
        }
    });

    context.subscriptions.push(configureCommand);

    const addWorkspaceCommand = vscode.commands.registerCommand('restfs.addWorkspace', async () => {
        const workspace = await vscode.window.showInputBox({
            prompt: 'Enter a name for the new REST FS workspace',
            placeHolder: 'workspace1',
        });

        if (workspace) {
            await config.update(
                `workspace.${workspace}`,
                {
                    baseUrl: 'http://localhost:3000/api/fs',
                    headers: {
                        Authorization: '',
                    },
                },
                vscode.ConfigurationTarget.Global,
            );
            vscode.window.showInformationMessage(
                `Workspace '${workspace}' added. Please configure it using the 'Configure REST FS' command.`,
            );
        }
    });

    context.subscriptions.push(addWorkspaceCommand);

    // Register shell task provider that uses a REST shell endpoint and streams output
    const shellTaskProvider = new RestShellTaskProvider(workspaceConfig);
    const shellTaskProviderRegistration = vscode.tasks.registerTaskProvider(
        RestShellTaskProvider.taskType,
        shellTaskProvider,
    );

    context.subscriptions.push(shellTaskProviderRegistration);

    /**
     * The `lukaot` scheme: one reference resolved against the local record store.
     *
     * `record` and `template` are one key lookup each; `payload` is the other half of the same
     * store; `trace` is the one member that no key carries, so it is answered by scanning what is
     * retained and said to be a listing rather than a replay (@@D-1041). A miss returns a document
     * that says so and names the command that looks again — never an error dialog, because a
     * reference that has aged out of a bounded store is a normal answer.
     */
    class ReferenceContentProvider implements vscode.TextDocumentContentProvider {
        async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
            const cfg = vscode.workspace.getConfiguration('restfs');
            const cachePath = cachePathOf(cfg.get<string>('blongLogCachePath'));
            const kind = KIND_BY_SEGMENT[uri.authority];
            let id: string;
            try {
                id = decodeURIComponent(uri.path.replace(/^\//, ''));
            } catch {
                id = uri.path.replace(/^\//, '');
            }
            if (!kind) {
                return [
                    `lukaot://${uri.authority}/${id} — unknown reference kind`,
                    '',
                    'A reference is `lukaot://<r|t|x|p>/<id>`: a record, a shape, a trace or a',
                    'payload. The vocabulary is declared once, in `core/lukaot/src/refs.ts`.',
                ].join('\n');
            }
            if (kind === 'trace') {
                try {
                    return traceListing(id, await scanStore(cachePath), cachePath);
                } catch (error) {
                    return `The store at ${cachePath} could not be read: ${error}`;
                }
            }
            const entry = await readEntry(cachePath, id);
            return entry ? entryText(kind, entry) : missingEntry(kind, id, cachePath);
        }
    }
    const referenceContentProvider = vscode.workspace.registerTextDocumentContentProvider(
        'lukaot',
        new ReferenceContentProvider(),
    );
    context.subscriptions.push(referenceContentProvider);

    // A `lukaot` document has no extension to derive a language from, so it is given one here: the
    // record and payload bodies are JSON, and a trace listing is prose the reader scans by column.
    const referenceLanguage = vscode.workspace.onDidOpenTextDocument(async document => {
        if (document.uri.scheme !== 'lukaot') {
            return;
        }
        const language = KIND_BY_SEGMENT[document.uri.authority] === 'trace' ? 'plaintext' : 'json';
        await vscode.languages.setTextDocumentLanguage(document, language);
    });
    context.subscriptions.push(referenceLanguage);

    // A scan is remembered for a minute; a store moved by configuration starts over immediately.
    const storeChanges = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('restfs.blongLogCachePath')) {
            invalidateStoreScan();
        }
    });
    context.subscriptions.push(storeChanges);

    // In the editor the same references are quoted in prose — a note, a doc page, a test fixture —
    // so a link is offered wherever one appears, not only where the terminal prints one. A markdown
    // page quotes a reference to show its form as often as it cites one, so there the same
    // code-formatting exemption the `@@` provider applies is applied here too.
    const referenceLinks = vscode.languages.registerDocumentLinkProvider(
        {scheme: '*'},
        {
            provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
                const links: vscode.DocumentLink[] = [];
                const references = new RegExp(LOG_REFERENCE_RE.source, 'g');
                const markdown = isMarkdown(document.languageId);
                let fenced = false;
                for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
                    const line = document.lineAt(lineNumber).text;
                    if (markdown && FENCE.test(line)) {
                        fenced = !fenced;
                        continue;
                    }
                    if (markdown && fenced) {
                        continue;
                    }
                    for (const match of line.matchAll(references)) {
                        const start = match.index ?? 0;
                        if (markdown && insideCodeSpan(line, start)) {
                            continue;
                        }
                        links.push(
                            new vscode.DocumentLink(
                                new vscode.Range(
                                    lineNumber,
                                    start,
                                    lineNumber,
                                    start + match[0].length,
                                ),
                                vscode.Uri.parse(match[0]),
                            ),
                        );
                    }
                }
                return links;
            },
        },
    );
    context.subscriptions.push(referenceLinks);

    // Terminal links cover the reference group a line ends with and the `@@` tokens the dev CLI
    // echoes, because a terminal does not resolve either of them on its own.
    const referenceLinkProvider = vscode.window.registerTerminalLinkProvider({
        provideTerminalLinks(
            terminalContext: vscode.TerminalLinkContext,
        ): IReferenceTerminalLink[] {
            return terminalLinks(terminalContext.line);
        },

        async handleTerminalLink(link: IReferenceTerminalLink): Promise<void> {
            if (link.reference) {
                await openReference(link.reference);
                return;
            }
            if (link.memory) {
                await openMemoryToken(link.memory);
            }
        },
    });
    context.subscriptions.push(referenceLinkProvider);

    // Memory cross-references: hover a `@@` token to see the entry it names, click to
    // open it, F12 to jump to the entry's line. Reads a derived index; never writes.
    registerMemoryReferences(context);
}

export function deactivate() {}
