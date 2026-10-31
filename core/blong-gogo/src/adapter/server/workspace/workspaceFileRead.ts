import {handler} from '@feasibleone/blong/types';

/** `workspace.file.read` — one file, inside the ticket directory. */
export default handler(() => ({
    async workspaceFileRead(params: {ticketId: string; path: string}, _$meta: unknown) {
        const self = this as unknown as {
            fileRead: (p: {ticketId: string; path: string}) => Promise<unknown>;
        };
        return self.fileRead(params);
    },
}));
