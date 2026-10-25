import {type IMeta, handler} from '@feasibleone/blong';

/** `sport.coach.edit` — writes the person half and the coach half. */
export default handler(({handler: {partyPersonEdit}, lib: {profileUpdate}}) => ({
    async sportCoachEdit(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileUpdate(qb, 'coach', params, partyPersonEdit as never, $meta as never);
    },
}));
