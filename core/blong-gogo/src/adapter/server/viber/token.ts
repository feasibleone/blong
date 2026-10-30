import type {IChatAccountMap} from '@feasibleone/blong/types';
import {library} from '@feasibleone/blong/types';

import {chatAccountBase, chatAccountName} from '../../../chatAccounts.ts';

/**
 * Which auth token a call is made with.
 *
 * Viber's token authenticates both directions, so the same lookup serves the API call and the reply's
 * signature key. An alias nothing matches answers `undefined`, and the caller reports it with its own
 * typed error.
 */
export const viberTokenGet = (
    accounts: IChatAccountMap | undefined,
    account?: string,
): string | undefined => {
    const name = chatAccountName(accounts, account);
    return name ? accounts?.[name]?.authToken : undefined;
};

/** The API base this account posts to — its own, or the port's (`@@D-687`). */
export const viberBaseGet = (
    accounts: IChatAccountMap | undefined,
    account: string | undefined,
    fallback?: string,
): string => chatAccountBase(accounts, account, fallback) ?? 'https://chatapi.viber.com/pa/';

export default library(() => ({viberTokenGet, viberBaseGet}));
