import {handler} from '@feasibleone/blong';

/** `sport.coach.get` — one flat person + coach row. */
export default handler(({lib: {profileGet}}) => ({
    async sportCoachGet(params: Record<string, unknown>) {
        const qb = this.config?.context?.queryBuilder;
        return profileGet(qb, 'coach', params);
    },
}));
