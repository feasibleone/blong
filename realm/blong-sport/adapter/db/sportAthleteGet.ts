import {handler} from '@feasibleone/blong';

/** `sport.athlete.get` — one flat person + athlete row. */
export default handler(({lib: {profileGet}}) => ({
    async sportAthleteGet(params: Record<string, unknown>) {
        const qb = this.config?.context?.queryBuilder;
        return profileGet(qb, 'athlete', params);
    },
}));
