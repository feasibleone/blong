import {handler} from '@feasibleone/blong';

/** `sport.coach.find` — flat person + coach projection. */
export default handler(({lib: {profileFind}}) => ({
    async sportCoachFind(params: Record<string, unknown>) {
        const qb = this.config?.context?.queryBuilder;
        return profileFind(qb, 'coach', params);
    },
}));
