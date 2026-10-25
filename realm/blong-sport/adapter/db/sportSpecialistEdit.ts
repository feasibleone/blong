import {type IMeta, handler} from '@feasibleone/blong';

/** `sport.specialist.edit` — writes the person half and the specialist half. */
export default handler(({handler: {partyPersonEdit}, lib: {profileUpdate}}) => ({
    async sportSpecialistEdit(params: Record<string, unknown>, $meta: IMeta) {
        const qb = this.config?.context?.queryBuilder;
        return profileUpdate(qb, 'specialist', params, partyPersonEdit as never, $meta as never);
    },
}));
