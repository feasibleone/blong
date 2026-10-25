import {handler} from '@feasibleone/blong';

/** `sport.federation.find` — flat organisation + federation projection. */
export default handler(({lib: {profileFind}}) => ({
    async sportFederationFind(params: Record<string, unknown>) {
        const qb = this.config?.context?.queryBuilder;
        return profileFind(qb, 'federation', params);
    },
}));
