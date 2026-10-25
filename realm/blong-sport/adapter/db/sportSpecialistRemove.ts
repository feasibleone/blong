import {type IMeta, handler} from '@feasibleone/blong';

/** `sport.specialist.remove` — @@D-595 */
export default handler(({handler: {partyPersonRemove}, lib: {profileRemove}}) => ({
    async sportSpecialistRemove(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileRemove(qb, 'specialist', params, partyPersonRemove as never, $meta as never);
    },
}));
