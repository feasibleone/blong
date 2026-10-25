import {type IMeta, handler} from '@feasibleone/blong';

/** `sport.club.add` — the organisation is created by party, the club row under it. */
export default handler(({handler: {partyOrganizationAdd}, lib: {profileCreate}}) => ({
    async sportClubAdd(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileCreate(qb, 'club', params, partyOrganizationAdd as never, $meta as never);
    },
}));
