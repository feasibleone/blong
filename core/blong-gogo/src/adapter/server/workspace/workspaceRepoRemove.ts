import {handler} from '@feasibleone/blong/types';

/** `workspace.repo.remove` — purge the directory, which a refused recovery does (`@@D-705`). */
export default handler(() => ({
    async workspaceRepoRemove(params: {ticketId: string}, _$meta: unknown) {
        const self = this as unknown as {
            repoRemove: (p: {ticketId: string}) => Promise<unknown>;
        };
        return self.repoRemove(params);
    },
}));
