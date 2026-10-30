/**
 * simRecord.ts — what the simulators received, for the assertions that read it.
 *
 * A module rather than a handler: the sim ports and the test groups run in one process, so the test
 * can look at what the platform API was asked to do without a method to poll. It lives at the realm
 * root because a file inside `sim/` would be loaded as a layer component, and this is plain state.
 */
export interface ISimRequest {
    platform: 'slack' | 'viber' | 'chat';
    path: string;
    body: unknown;
}

const requests: ISimRequest[] = [];

/**
 * How many messages each conversation has received.
 *
 * A question is posted and its answer is echoed, so a simulator sometimes has to tell the two apart —
 * and the honest way to model "the bot was removed while a question waited" is to let the first
 * message through and refuse what follows.
 */
const messages = new Map<string, number>();

export const simRecord = (entry: ISimRequest): void => {
    requests.push(entry);
};

/** Count a message in a conversation and answer how many that makes. */
export const simMessageCount = (conversationId: string): number => {
    const count = (messages.get(conversationId) ?? 0) + 1;
    messages.set(conversationId, count);
    return count;
};

export const simRequests = (platform?: ISimRequest['platform']): ISimRequest[] =>
    platform ? requests.filter(entry => entry.platform === platform) : [...requests];

export const simReset = (): void => {
    requests.length = 0;
    messages.clear();
};
