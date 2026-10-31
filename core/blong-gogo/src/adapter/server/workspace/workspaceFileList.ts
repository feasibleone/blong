import {handler} from '@feasibleone/blong/types';

/** `workspace.file.list` — what is in the ticket directory, without reading it. */
export default handler(() => ({
    async workspaceFileList(params: {ticketId: string; path?: string}, _$meta: unknown) {
        const self = this as unknown as {
            fileList: (p: {ticketId: string; path?: string}) => Promise<unknown>;
        };
        return self.fileList(params);
    },
}));
