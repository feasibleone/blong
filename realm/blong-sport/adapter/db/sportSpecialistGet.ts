import {handler} from '@feasibleone/blong';

/** `sport.specialist.get` — one flat person + specialist row. */
export default handler(({lib: {profileGet}}) => ({
    async sportSpecialistGet(params: Record<string, unknown>) {
        const qb = this.config?.context?.queryBuilder;
        return profileGet(qb, 'specialist', params);
    },
}));
