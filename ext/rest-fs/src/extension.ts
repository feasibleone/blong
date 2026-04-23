import * as path from 'node:path';
import * as os from 'node:os';
import * as vscode from 'vscode';
import * as cacache from 'cacache';
import {RestFileSystemProvider} from './restFileSystemProvider';
import {RestShellTaskProvider} from './restShellTaskProvider';

type RestFsWorkspaceConfig = Record<
    string,
    {
        baseUrl: string;
        headers?: Record<string, string>;
    }
>;

/** A terminal link that carries the ULID of the associated log entry. */
interface BlongLogTerminalLink extends vscode.TerminalLink {
    logId: string;
}

/** Regex matching the ULID embedded in blong://log/<ULID> OSC 8 link text. */
const LOG_LINK_REGEX = /blong:\/\/log\/([0-9A-Z]+)/;

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

    // Register terminal link provider for blong://log/<ULID> links emitted by pino-cacache
    const logLinkProvider = vscode.window.registerTerminalLinkProvider({
        provideTerminalLinks(
            terminalContext: vscode.TerminalLinkContext,
        ): BlongLogTerminalLink[] {
            const match = LOG_LINK_REGEX.exec(terminalContext.line);
            if (!match) {
                return [];
            }
            return [
                {
                    startIndex: match.index,
                    length: match[0].length,
                    tooltip: 'Open log entry details',
                    logId: match[1],
                },
            ];
        },

        async handleTerminalLink(link: BlongLogTerminalLink): Promise<void> {
            const cfg = vscode.workspace.getConfiguration('restfs');
            const cachePathRaw: string = cfg.get('blongLogCachePath', '~/.blong/log-cache');
            const cachePath = cachePathRaw.startsWith('~')
                ? path.join(os.homedir(), cachePathRaw.slice(1))
                : cachePathRaw;

            let content: string;
            try {
                const result = await cacache.get(cachePath, link.logId);
                const entry = JSON.parse(result.data.toString()) as unknown;
                content = JSON.stringify(entry, null, 2);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to read log entry ${link.logId}: ${err}`);
                return;
            }

            const doc = await vscode.workspace.openTextDocument({
                content,
                language: 'json',
            });
            await vscode.window.showTextDocument(doc);
        },
    });

    context.subscriptions.push(logLinkProvider);
}

export function deactivate() {}
