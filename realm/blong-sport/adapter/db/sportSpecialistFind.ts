import {handler} from '@feasibleone/blong';

/** `sport.specialist.find` — flat person + specialist projection. */
export default handler(({lib: {profileFind}}) => ({
    async sportSpecialistFind(params: Record<string, unknown>) {
        const qb = this.config?.context?.queryBuilder;
        return profileFind(qb, 'specialist', params);
    },
}));
