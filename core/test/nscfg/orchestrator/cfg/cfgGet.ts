import {handler} from '@feasibleone/blong';

export default handler(
    ({config}: {config: {source?: string; extra?: string}}) =>
        async function cfgGet(): Promise<{source: string; extra: string}> {
            return {source: config.source, extra: config.extra};
        },
);
