import {handler} from '@feasibleone/blong/types';

/** `workspace.file.write` — write or replace a file, creating its directory. */
export default handler(() => ({
    async workspaceFileWrite(
        params: {ticketId: string; path: string; content: string},
        _$meta: unknown,
    ) {
        const self = this as unknown as {
            fileWrite: (p: {ticketId: string; path: string; content: string}) => Promise<unknown>;
        };
        return self.fileWrite(params);
    },
}));
