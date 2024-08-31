import { handler } from '@feasibleone/blong';

export default handler(({
    lib: {
        jwks
    }
}) => ({
    loginOidcGetKeys: jwks
}));
