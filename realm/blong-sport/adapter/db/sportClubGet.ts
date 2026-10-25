import {handler} from '@feasibleone/blong';

/** `sport.club.get` — one flat organisation + club row. */
export default handler(({lib: {profileGet}}) => ({
    async sportClubGet(params: Record<string, unknown>) {
        const qb = this.config?.context?.queryBuilder;
        return profileGet(qb, 'club', params);
    },
}));
