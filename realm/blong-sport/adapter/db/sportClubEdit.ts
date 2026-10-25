import {type IMeta, handler} from '@feasibleone/blong';

/** `sport.club.edit` — writes the organisation half and the club half. */
export default handler(({handler: {partyOrganizationEdit}, lib: {profileUpdate}}) => ({
    async sportClubEdit(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileUpdate(qb, 'club', params, partyOrganizationEdit as never, $meta as never);
    },
}));
