import {type IMeta, handler} from '@feasibleone/blong';

/**
 * `sport.athlete.remove` — the profile row first, the person behind it only when
 * no other profile still holds the id. @@D-595
 */
export default handler(({handler: {partyPersonRemove}, lib: {profileRemove}}) => ({
    async sportAthleteRemove(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileRemove(qb, 'athlete', params, partyPersonRemove as never, $meta as never);
    },
}));
