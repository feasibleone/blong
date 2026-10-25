import {type IMeta, handler} from '@feasibleone/blong';

/** `sport.coach.add` — the person is created by party, the coach row under it. */
export default handler(({handler: {partyPersonAdd}, lib: {profileCreate}}) => ({
    async sportCoachAdd(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileCreate(qb, 'coach', params, partyPersonAdd as never, $meta as never);
    },
}));
