import type {IMeta} from '@feasibleone/blong';
import type {IChatChannel} from '@feasibleone/blong/types';

/**
 * orchestrator/settings.ts — what a handler reads from the port it was dispatched on.
 *
 * A group closure is handed its own folder's config slice (`chat.in`, `chat.out`, `chat.prompt`),
 * while `this` inside a handler is the port the method was dispatched on. The realm's own setting
 * therefore lives under that port's name — `chat.chatDispatch.forward` — and the port gives it a
 * default in its activation, so a deployment that configures nothing still answers the platform
 * (`@@F-641`).
 */
export interface IChatDispatchSettings {
    /**
     * Account alias to the method that account's inbound messages go to.
     *
     * A map rather than one method, because one process serves several accounts and they are not the
     * same conversation: a test workspace may feed a recorder while the production one feeds a realm
     * (`@@D-687`). The `*` key is what an account nobody mapped gets. A plain string is the shape this
     * setting had before it was per account, and it is read as the `*` entry rather than ignored.
     */
    forward: Record<string, string> | string;
    /**
     * Where a conversation is remembered.
     *
     * `none` is the default and the realm stays what it was: a bridge with no state, forwarding every
     * message the way its forward map says. `db` turns on the lookup and the two writes, and needs the
     * shared `srv.db` adapter to be part of the process (`@@D-727`).
     */
    channelStore?: 'none' | 'db';
}

export interface IChatDispatchPort {
    config: IChatDispatchSettings;
    dispatch: (params: unknown, $meta: IMeta) => Promise<unknown>;
}

/** The method an account's messages go to: its own entry, the `*` default, or the one-method shape. */
export const forwardTarget = (
    settings: IChatDispatchSettings | undefined,
    account: string | undefined,
): string | undefined => {
    const forward = settings?.forward;
    if (typeof forward === 'string') return forward;
    return forward?.[account ?? ''] ?? forward?.['*'];
};

/**
 * The channel row inside whatever a dispatch replied with.
 *
 * A dispatch answers the response the callee produced, sometimes wrapped in the array the transport
 * carries, so both shapes are read here rather than at each call site.
 */
export const channelOf = (value: unknown): IChatChannel | undefined => {
    if (Array.isArray(value)) return channelOf(value[0]);
    if (!value || typeof value !== 'object') return undefined;
    const channel = (value as {channel?: IChatChannel}).channel;
    return channel && typeof channel === 'object' ? channel : undefined;
};
