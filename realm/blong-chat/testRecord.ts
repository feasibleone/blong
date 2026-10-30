/**
 * testRecord.ts — what the realm forwarded into the test layer.
 *
 * The inbound side of the bridge has no return value worth asserting, so the realm is configured (in
 * `index.ts`, under `integration`) to forward a message to `test.chat.received`, and that handler
 * records here. A module rather than a port: the tests and the recorder are one process.
 */
export interface IInboundRecord {
    kind: string;
    platform: string;
    account?: string;
    conversationId: string;
    messageId?: string;
    type?: string;
    text?: string;
    answer?: {promptId: string; value?: string; values?: string[]; text?: string};
}

const forwarded: IInboundRecord[] = [];

export const recordForwarded = (entry: IInboundRecord): void => {
    forwarded.push(entry);
};

export const forwardedMessages = (): IInboundRecord[] => [...forwarded];

export const resetForwarded = (): void => {
    forwarded.length = 0;
};
