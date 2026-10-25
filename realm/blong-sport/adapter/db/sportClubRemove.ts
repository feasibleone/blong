import {type IMeta, handler} from '@feasibleone/blong';

/** `sport.club.remove` — @@D-595 */
export default handler(({handler: {partyOrganizationRemove}, lib: {profileRemove}}) => ({
    async sportClubRemove(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileRemove(qb, 'club', params, partyOrganizationRemove as never, $meta as never);
    },
}));
