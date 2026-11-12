import type {IChatAccount} from '@feasibleone/blong/types';

import {chatPublicUrl} from '../../chatAccounts.ts';

/**
 * The parts of a Slack app's manifest this port rewrites.
 *
 * A tunnel hands out a new hostname more often than anything else in a chat deployment changes, and
 * pointing Slack at it is two fields in the app's manifest rather than a dashboard visit per restart.
 * The rewrite is pure so a test can assert it without a workspace, and so `ready` is only the HTTP
 * calls around it (`@@D-688`).
 */
export interface ISlackManifest {
    settings?: {
        interactivity?: {is_enabled?: boolean; request_url?: string; [key: string]: unknown};
        event_subscriptions?: {request_url?: string; bot_events?: string[]; [key: string]: unknown};
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

/** The address Slack should post to for one account: the port's path, on the account's public base. */
export const slackRequestUrl = (path: string, base: string, account: IChatAccount): string =>
    chatPublicUrl(path, base, account);

/**
 * The message events the port reads.
 *
 * A message is an answer as well as a message: a question with no control to submit is answered by a
 * reply, and the pending ask claims it. Slack names the event after the conversation it happened in —
 * `message.channels` for a public channel, `message.groups` for a private one (a plan's channel is
 * private), `message.im` for a direct message — so subscribing to one and not the others is a question
 * that answers in one place and times out in the next (@@D-821).
 */
export const slackMessageEvents = ['message.channels', 'message.groups', 'message.im'];

/**
 * The manifest with both request URLs pointed at one address, and the message events subscribed.
 *
 * A copy, because the manifest came from Slack and a caller may still want the original. What the
 * deployment subscribed on its own is left alone — the events are added, never replaced, because a
 * realm may listen to something this port knows nothing about (`@@D-821`).
 */
export const slackManifestRepoint = (
    manifest: ISlackManifest,
    requestUrl: string,
    events: string[] = slackMessageEvents,
): ISlackManifest => {
    const next = structuredClone(manifest);
    const settings = (next.settings ??= {});
    settings.interactivity = {...settings.interactivity, is_enabled: true, request_url: requestUrl};
    const subscribed = settings.event_subscriptions?.bot_events ?? [];
    settings.event_subscriptions = {
        ...settings.event_subscriptions,
        request_url: requestUrl,
        bot_events: [...subscribed, ...events.filter(event => !subscribed.includes(event))],
    };
    return next;
};

/**
 * Whether the app already posts to this address and listens to what the port reads.
 *
 * Four things have to hold, because they are four separate app settings: interactivity has to be
 * enabled, both request URLs — interactivity and event subscriptions — have to be the address being
 * asked for, and the message events have to be subscribed. Any one left behind is an app that receives
 * part of what it should: a URL on an old hostname receives nothing, and a missing `message.groups`
 * receives no message from a private channel, which is a typed answer lost (@@D-821).
 *
 * A match is what lets a start skip `apps.manifest.update`, which is worth doing: that call is one of
 * the most tightly rate-limited Slack has, and a process that restarts on every deploy would spend the
 * budget rewriting a manifest that says exactly what it already says (`@@D-688`).
 */
export const slackManifestPointsAt = (
    manifest: ISlackManifest,
    requestUrl: string,
    events: string[] = slackMessageEvents,
): boolean => {
    const settings = manifest.settings;
    const subscribed = settings?.event_subscriptions?.bot_events ?? [];
    return (
        settings?.interactivity?.is_enabled === true &&
        settings.interactivity.request_url === requestUrl &&
        settings?.event_subscriptions?.request_url === requestUrl &&
        events.every(event => subscribed.includes(event))
    );
};
