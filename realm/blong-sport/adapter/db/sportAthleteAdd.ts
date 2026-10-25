import {type IMeta, handler} from '@feasibleone/blong';

/** `sport.athlete.add` — the person is created by party, the profile under it. @@D-595 */
export default handler(({handler: {partyPersonAdd}, lib: {profileCreate}}) => ({
    async sportAthleteAdd(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileCreate(qb, 'athlete', params, partyPersonAdd as never, $meta as never);
    },
}));
