import type {Adapter} from '@feasibleone/blong/types';
import {adapter} from '@feasibleone/blong/types';

import type {IWorkspaceCommand, IWorkspaceConfig} from '../impl/workspaceFs.ts';
import {
    workspaceList,
    workspacePrepare,
    workspaceRead,
    workspaceRemove,
    workspaceRollback,
    workspaceRun,
    workspaceWrite,
} from '../impl/workspaceFs.ts';

/**
 * `adapter.workspace` — the ticket's directory as one vocabulary.
 *
 * Seven methods, grouped by what they act on: `workspace.repo.prepare`, `workspace.repo.rollback`,
 * `workspace.repo.remove`, `workspace.file.read`, `workspace.file.write`, `workspace.file.list` and
 * `workspace.command.run`. The filesystem and process client is this adapter's, so no handler ever
 * opens a file or spawns anything itself (`@@D-710`).
 *
 * The root, the template and whether a command may run at all are deployment configuration, and the
 * same adapter may be instantiated more than once under different names (`@@D-712`) — one instance per
 * workspace root a deployment keeps.
 */
export interface IConfig extends IWorkspaceConfig {
    /** Directory a command may see, besides `PATH`. Always scrubbed to this map. */
    env?: Record<string, string>;
}

export default adapter<IConfig>(() => ({
    activation: {
        default: {
            namespace: 'workspace',
            imports: [/\.workspace$/],
            root: '.agent-workspace',
            shell: {enabled: false},
        },
    },
    /** Open the adapter's loop before the platform serves; without it `start` never settles (`@@F-651`). */
    start(this: Adapter<IConfig>) {
        super.connect();
        return super.start();
    },
    repoPrepare(this: Adapter<IConfig>, params: {ticketId: string}) {
        return workspacePrepare(this.config, params);
    },
    repoRollback(this: Adapter<IConfig>, params: {ticketId: string; baseCommit?: string}) {
        return workspaceRollback(this.config, params);
    },
    repoRemove(this: Adapter<IConfig>, params: {ticketId: string}) {
        return workspaceRemove(this.config, params);
    },
    fileRead(this: Adapter<IConfig>, params: {ticketId: string; path: string}) {
        return workspaceRead(this.config, params);
    },
    fileWrite(this: Adapter<IConfig>, params: {ticketId: string; path: string; content: string}) {
        return workspaceWrite(this.config, params);
    },
    fileList(this: Adapter<IConfig>, params: {ticketId: string; path?: string}) {
        return workspaceList(this.config, params);
    },
    commandRun(this: Adapter<IConfig>, params: IWorkspaceCommand) {
        // The account-level allowlist is the deployment's `shell.env`; the command itself is argv, so
        // there is no shell to interpret it.
        return workspaceRun(this.config, params);
    },
}));
