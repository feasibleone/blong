import {handler} from '@feasibleone/blong';
import type {IMeta} from '@feasibleone/blong';

/**
 * Register callback endpoints for a participant.
 *
 * Configures where the switch should send callbacks (transfers, quotes, parties).
 * Typically points to the blong-ttk callback server for test scenarios.
 *
 * @param name - Participant/DFSP name
 * @param baseUrl - Base callback URL (defaults to http://localhost:5050)
 * @returns Array of registered endpoints
 */
export default handler(({handler: {adminEndpointAdd}}) => ({
    async provisionEndpointAdd(
        {
            name,
            baseUrl = 'http://localhost:5050',
        }: {
            name: string;
            baseUrl?: string;
        },
        $meta: IMeta,
    ) {
        // Define all callback endpoint types
        const endpointTypes = [
            'FSPIOP_CALLBACK_URL_TRANSFER_POST',
            'FSPIOP_CALLBACK_URL_TRANSFER_PUT',
            'FSPIOP_CALLBACK_URL_TRANSFER_ERROR',
            'FSPIOP_CALLBACK_URL_QUOTES_POST',
            'FSPIOP_CALLBACK_URL_QUOTES_PUT',
            'FSPIOP_CALLBACK_URL_QUOTES_ERROR',
            'FSPIOP_CALLBACK_URL_PARTIES_GET',
            'FSPIOP_CALLBACK_URL_PARTIES_PUT',
            'FSPIOP_CALLBACK_URL_PARTIES_ERROR',
        ] as const;

        // Register each endpoint type
        const endpoints = await Promise.all(
            endpointTypes.map(type =>
                adminEndpointAdd(
                    {
                        name,
                        endpoint: {
                            type,
                            value: `${baseUrl}/${name}`,
                        },
                    },
                    $meta,
                ),
            ),
        );

        return {
            name,
            baseUrl,
            endpoints,
        };
    },
}));
