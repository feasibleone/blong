import {handler} from '@feasibleone/blong/types';

/**
 * `workspace.command.run` — one command, argv only, in the ticket directory (`@@D-710`).
 *
 * It is refused when the deployment switched the capability off, and it is killed with its process
 * group when it outlives its timeout — neither is a courtesy, they are why this method exists.
 */
export default handler(() => ({
    async workspaceCommandRun(
        params: {
            ticketId: string;
            command: string;
            args?: string[];
            path?: string;
            timeoutMs?: number;
        },
        _$meta: unknown,
    ) {
        const self = this as unknown as {
            commandRun: (p: {
                ticketId: string;
                command: string;
                args?: string[];
                path?: string;
                timeoutMs?: number;
            }) => Promise<unknown>;
        };
        return self.commandRun(params);
    },
}));
