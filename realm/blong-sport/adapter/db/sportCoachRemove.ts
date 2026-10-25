import {type IMeta, handler} from '@feasibleone/blong';

/** `sport.coach.remove` — @@D-595 */
export default handler(({handler: {partyPersonRemove}, lib: {profileRemove}}) => ({
    async sportCoachRemove(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileRemove(qb, 'coach', params, partyPersonRemove as never, $meta as never);
    },
}));
