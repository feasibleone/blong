import {adapter, type Errors, type IErrorMap, type IMeta} from '@feasibleone/blong';
import {IncomingWebhook} from '@slack/webhook';

export interface IConfig {
    slack: {
        webhookUrl: string;
    };
    context: {
        slack: IncomingWebhook;
    };
}

const errorMap: IErrorMap = {
    'slack.generic': 'Slack Error',
    'slack.invalid': 'Invalid Slack Operation',
    'slack.notFound': 'Slack Not Found',
    'slack.exists': 'Slack Exists',
    'slack.unique': 'Slack Unique',
    'slack.missingKey': 'Missing key value for {key}',
};

let _errors: Errors<typeof errorMap>;

export default adapter<IConfig>(({utError}) => {
    _errors ||= utError.register(errorMap);

    return {
        async init(...configs: object[]) {
            await super.init(
                {
                    type: 'slack',
                    slack: {},
                },
                ...configs,
            );
        },
        start() {
            this.config.context = {
                slack: new IncomingWebhook(this.config.slack.webhookUrl),
            };
            super.connect();
            return super.start();
        },
        async stop(...params: unknown[]) {
            this.config.context = null;
            return await super.stop(...params);
        },
        async exec(
            params: {
                text?: string;
                blocks?: unknown[];
                attachments?: unknown[];
                channel?: string;
                username?: string;
                iconEmoji?: string;
                iconUrl?: string;
                threadTs?: string;
                unfurlLinks?: boolean;
                unfurlMedia?: boolean;
            } & Record<string, unknown>,
            {method}: IMeta,
        ) {
            const [, , operation] = method.split('.');
            switch (operation) {
                case 'send':
                case 'post':
                case 'message': {
                    // Send a message to Slack
                    const {
                        text,
                        blocks,
                        attachments,
                        channel,
                        username,
                        iconEmoji,
                        iconUrl,
                        threadTs,
                        unfurlLinks,
                        unfurlMedia,
                    } = params;

                    if (!text && !blocks && !attachments) {
                        throw _errors['slack.invalid']({
                            message: 'Must provide text, blocks, or attachments',
                        });
                    }

                    const payload: Record<string, unknown> = {};
                    if (text) payload.text = text;
                    if (blocks) payload.blocks = blocks;
                    if (attachments) payload.attachments = attachments;
                    if (channel) payload.channel = channel;
                    if (username) payload.username = username;
                    if (iconEmoji) payload.icon_emoji = iconEmoji;
                    if (iconUrl) payload.icon_url = iconUrl;
                    if (threadTs) payload.thread_ts = threadTs;
                    if (unfurlLinks !== undefined) payload.unfurl_links = unfurlLinks;
                    if (unfurlMedia !== undefined) payload.unfurl_media = unfurlMedia;

                    try {
                        return await this.config.context.slack.send(payload);
                    } catch (error) {
                        throw _errors['slack.generic'](error);
                    }
                }
            }
            throw _errors['slack.invalid']({operation});
        },
    };
});
