import { handler } from '@feasibleone/blong';

export default handler(() => function loginOidcGetConfiguration(params, {httpRequest: {url: urlRequest, headers}}) {
    const url = new URL(urlRequest);
    if (headers['x-forwarded-host']) {
        url.port = ''; // WTF WHATWG!
        url.host = headers['x-forwarded-host'];
        if (headers['x-forwarded-proto']) url.protocol = headers['x-forwarded-proto'];
    }
    return {
        issuer: 'ut-login',
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
        authorization_endpoint: new URL('../form', url.href).href,
        token_endpoint: new URL('../token', url.href).href,
        jwks_uri: new URL('../jwks', url.href).href
    };
});
