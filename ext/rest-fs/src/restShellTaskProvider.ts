import * as vscode from 'vscode';

type RestFsWorkspaceConfig = Record<
    string,
    {
        baseUrl: string;
        headers?: Record<string, string>;
    }
>;

interface RestShellTaskDefinition extends vscode.TaskDefinition {
    type: 'restfs-shell';
    workspace: string;
    command: string;
    cwd?: string;
}

export class RestShellTaskProvider implements vscode.TaskProvider<vscode.Task> {
    static readonly taskType = 'restfs-shell';

    constructor(private readonly config: RestFsWorkspaceConfig) {}

    provideTasks(): vscode.ProviderResult<vscode.Task[]> {
        return [];
    }

    resolveTask(task: vscode.Task): vscode.Task | undefined {
        const definition = task.definition as RestShellTaskDefinition;

        if (!definition.workspace || !definition.command) {
            return undefined;
        }

        const execution = new vscode.CustomExecution(async resolvedDefinition => {
            return this.createPseudoterminal(resolvedDefinition as RestShellTaskDefinition);
        });

        return new vscode.Task(
            definition,
            task.scope ?? vscode.TaskScope.Workspace,
            task.name,
            RestShellTaskProvider.taskType,
            execution,
        );
    }

    private createPseudoterminal(definition: RestShellTaskDefinition): vscode.Pseudoterminal {
        const writeEmitter = new vscode.EventEmitter<string>();
        const closeEmitter = new vscode.EventEmitter<void | number>();

        const pty: vscode.Pseudoterminal = {
            onDidWrite: writeEmitter.event,
            onDidClose: closeEmitter.event,
            open: () => {
                void this.runShell(definition, writeEmitter, closeEmitter);
            },
            close: () => {
                // No explicit cancellation support from the backend yet
            },
        };

        return pty;
    }

    private async runShell(
        definition: RestShellTaskDefinition,
        writeEmitter: vscode.EventEmitter<string>,
        closeEmitter: vscode.EventEmitter<void | number>,
    ): Promise<void> {
        const workspaceConfig = this.config[definition.workspace];

        if (!workspaceConfig) {
            writeEmitter.fire(`Unknown REST FS workspace: ${definition.workspace}\r\n`);
            closeEmitter.fire(1);
            return;
        }

        const shellUrl = `${workspaceConfig.baseUrl}/shell`;

        try {
            const response = await fetch(shellUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(workspaceConfig.headers ?? {}),
                },
                body: JSON.stringify({
                    command: definition.command,
                    cwd: definition.cwd,
                }),
            });

            if (!response.ok || !response.body) {
                writeEmitter.fire(
                    `Shell endpoint error: HTTP ${response.status} ${response.statusText}\r\n`,
                );
                closeEmitter.fire(1);
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');

            while (true) {
                const {done, value} = await reader.read();
                if (done) {
                    break;
                }
                if (value) {
                    // Convert LF to CRLF for proper terminal display
                    // stream: true allows proper handling of multi-byte characters split across chunks
                    const text = decoder.decode(value, {stream: true});
                    const normalizedText = text.replace(/\r?\n/g, '\r\n');
                    writeEmitter.fire(normalizedText);
                }
            }

            closeEmitter.fire(0);
        } catch (error) {
            writeEmitter.fire(`Shell request failed: ${(error as Error).message}\r\n`);
            closeEmitter.fire(1);
        }
    }
}
