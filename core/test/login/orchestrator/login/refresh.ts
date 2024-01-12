import cbc from 'ut-function.cbc';
import { library } from '@feasibleone/blong';

export default library<{keys: {refresh: string, refreshCbc: unknown}}>(({
    config: {
        keys: {
            refresh,
            refreshCbc = cbc(refresh)
        }
    },
    handler: {
        errorLoginRefreshTokenExpired
    }
}) => ({
    writeRefresh(params: {refresh: number}) {
        return refreshCbc.encrypt(JSON.stringify({...params, expire: Date.now() + params.refresh * 1000})).toString('base64');
    },
    readRefresh(token: string) {
        const result = JSON.parse(refreshCbc.decrypt(Buffer.from(token, 'base64')));
        if (result.expire <= Date.now()) throw errorLoginRefreshTokenExpired();
        return result;
    }
}));
