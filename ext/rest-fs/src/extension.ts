import * as vscode from 'vscode';
import {RestFileSystemProvider} from './restFileSystemProvider';

/**
 * This method is called when your extension is activated
 * The extension is activated when a file with the restfs:// scheme is accessed
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('REST Filesystem extension is now active!');

    // Get configuration for the REST API endpoint
    const config = vscode.workspace.getConfiguration('restfs');

    // Create and register the filesystem provider
    const restFs = new RestFileSystemProvider(config.get('workspace', {}));

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
                    forceNewWindow: true,
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
        const baseUrl = await vscode.window.showInputBox({
            prompt: 'Enter REST API base URL',
            value: config.get<string>(
                `workspace.${workspace}.baseUrl`,
                'http://localhost:3000/api/fs',
            ),
            placeHolder: 'http://localhost:3000/api/fs',
        });
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
}

export function deactivate() {}
