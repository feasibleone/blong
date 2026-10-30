import type {IChatAccountMap} from '@feasibleone/blong/types';
import {library} from '@feasibleone/blong/types';

import {chatAccountBase} from '../../../chatAccounts.ts';

/**
 * Which bot token a call is made with, and which API base it is made against.
 *
 * The alias is what a caller names; a caller that names none gets the only account there is, which is
 * the ordinary case of one bot per process. An alias nothing matches answers `undefined` rather than
 * throwing — the caller reports it with its own typed error, which is where the API's `path` and
 * `json` are already known.
 */
export const slackTokenGet = (
    accounts: IChatAccountMap | undefined,
    account?: string,
): string | undefined => {
    const names = Object.keys(accounts ?? {});
    const name = account ?? (names.length === 1 ? names[0] : undefined);
    return name ? accounts?.[name]?.botToken : undefined;
};

/**
 * The API base this account posts to.
 *
 * Per account, because one process serves a real workspace and a simulator at the same time: a call
 * for the test account must not reach `slack.com`, and a call for the real one must not reach the
 * simulator (`@@D-687`).
 */
export const slackBaseGet = (
    accounts: IChatAccountMap | undefined,
    account: string | undefined,
    fallback?: string,
): string => chatAccountBase(accounts, account, fallback) ?? 'https://slack.com/api/';

export default library(() => ({slackTokenGet, slackBaseGet}));
