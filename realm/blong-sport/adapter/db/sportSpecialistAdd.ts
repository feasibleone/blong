import {type IMeta, handler} from '@feasibleone/blong';

/** `sport.specialist.add` — the person is created by party, the specialist row under it. */
export default handler(({handler: {partyPersonAdd}, lib: {profileCreate}}) => ({
    async sportSpecialistAdd(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileCreate(qb, 'specialist', params, partyPersonAdd as never, $meta as never);
    },
}));
