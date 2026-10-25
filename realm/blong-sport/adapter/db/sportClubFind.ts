import {handler} from '@feasibleone/blong';

/** `sport.club.find` — flat organisation + club projection. */
export default handler(({lib: {profileFind}}) => ({
    async sportClubFind(params: Record<string, unknown>) {
        const qb = this.config?.context?.queryBuilder;
        return profileFind(qb, 'club', params);
    },
}));
