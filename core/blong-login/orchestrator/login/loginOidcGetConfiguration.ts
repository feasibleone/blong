import {type IMeta, handler} from '@feasibleone/blong';

export default handler(
    () =>
        function loginOidcGetConfiguration(
            params: unknown,
            {httpRequest: {url: urlRequest, headers} = {url: '', headers: {}}}: IMeta,
        ) {
            const url = new URL(urlRequest);
            if (headers['x-forwarded-host']) {
                url.port = ''; // WTF WHATWG!
                url.host =
                    typeof headers['x-forwarded-host'] === 'string'
                        ? headers['x-forwarded-host']
                        : headers['x-forwarded-host'][0];
                if (headers['x-forwarded-proto'])
                    url.protocol =
                        typeof headers['x-forwarded-proto'] === 'string'
                            ? headers['x-forwarded-proto']
                            : headers['x-forwarded-proto'][0];
            }
            return {
                issuer: 'blong-login',
                // eslint-disable-next-line @typescript-eslint/naming-convention
                id_token_signing_alg_values_supported: ['RS256'],
                // eslint-disable-next-line @typescript-eslint/naming-convention
                code_challenge_methods_supported: ['S256'],
                authorization_endpoint: new URL('../form', url.href).href,
                token_endpoint: new URL('../token', url.href).href,
                jwks_uri: new URL('../jwks', url.href).href,
            };
        },
);
