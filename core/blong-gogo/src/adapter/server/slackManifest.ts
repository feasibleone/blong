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
 * The manifest with both request URLs pointed at one address.
 *
 * A copy, because the manifest came from Slack and a caller may still want the original. The bot's
 * event subscriptions are left exactly as they are: this method re-points the app, it does not decide
 * what the app listens to.
 */
export const slackManifestRepoint = (
    manifest: ISlackManifest,
    requestUrl: string,
): ISlackManifest => {
    const next = structuredClone(manifest);
    const settings = (next.settings ??= {});
    settings.interactivity = {...settings.interactivity, is_enabled: true, request_url: requestUrl};
    settings.event_subscriptions = {...settings.event_subscriptions, request_url: requestUrl};
    return next;
};

/**
 * Whether the app already posts to this address.
 *
 * Three things have to hold, because they are three separate app settings: interactivity has to be
 * enabled, and both request URLs — interactivity and event subscriptions — have to be the address
 * being asked for. One left behind on an old hostname is an app that receives half of what it should.
 *
 * A match is what lets a start skip `apps.manifest.update`, which is worth doing: that call is one of
 * the most tightly rate-limited Slack has, and a process that restarts on every deploy would spend the
 * budget rewriting a manifest that says exactly what it already says (`@@D-688`).
 */
export const slackManifestPointsAt = (manifest: ISlackManifest, requestUrl: string): boolean => {
    const settings = manifest.settings;
    return (
        settings?.interactivity?.is_enabled === true &&
        settings.interactivity.request_url === requestUrl &&
        settings?.event_subscriptions?.request_url === requestUrl
    );
};
