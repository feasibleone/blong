import {handler} from '@feasibleone/blong/types';

/** `workspace.repo.rollback` — tracked files restored, untracked ones removed (`@@D-710`). */
export default handler(() => ({
    async workspaceRepoRollback(params: {ticketId: string; baseCommit?: string}, _$meta: unknown) {
        const self = this as unknown as {
            repoRollback: (p: {ticketId: string; baseCommit?: string}) => Promise<unknown>;
        };
        return self.repoRollback(params);
    },
}));
