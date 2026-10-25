import {type IMeta, handler} from '@feasibleone/blong';

/** `sport.athlete.edit` — writes the person half and the profile half; the id never moves. */
export default handler(({handler: {partyPersonEdit}, lib: {profileUpdate}}) => ({
    async sportAthleteEdit(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileUpdate(qb, 'athlete', params, partyPersonEdit as never, $meta as never);
    },
}));
