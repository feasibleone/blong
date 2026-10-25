import {handler} from '@feasibleone/blong';

/** `sport.athlete.find` — flat person + athlete projection. @@D-596 */
export default handler(({lib: {profileFind}}) => ({
    async sportAthleteFind(params: Record<string, unknown>) {
        const qb = this.config?.context?.queryBuilder;
        return profileFind(qb, 'athlete', params);
    },
}));
