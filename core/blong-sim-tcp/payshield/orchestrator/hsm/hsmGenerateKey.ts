import {handler} from '@feasibleone/blong';

/**
 * Registers the HSM generate key library function as the handler for hsm.generateKey.
 * The lib.generateKey function performs all parameter transformation before calling
 * the Payshield TCP adapter.
 */
export default handler(({lib: {generateKey}}) => ({
    'hsm.generateKey': generateKey,
}));
