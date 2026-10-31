import {handler} from '@feasibleone/blong/types';

/** `workspace.repo.prepare` — the ticket's directory, from the template when one is configured. */
export default handler(() => ({
    async workspaceRepoPrepare(params: {ticketId: string}, _$meta: unknown) {
        const self = this as unknown as {
            repoPrepare: (p: {ticketId: string}) => Promise<unknown>;
        };
        return self.repoPrepare(params);
    },
}));
