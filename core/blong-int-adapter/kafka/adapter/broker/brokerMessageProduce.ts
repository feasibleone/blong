import {handler} from '@feasibleone/blong';
import type {Duplex} from 'stream';

export default handler(
    proxy =>
        async function brokerMessageProduce(
            {
                topic,
                message,
                partition = 0,
            }: {topic?: string; message?: string; partition?: number},
            $meta,
        ) {
            const stream = proxy.config?.context?.kafkaStream as Duplex | undefined;
            if (!stream) {
                throw new Error('Kafka stream not connected');
            }
            const buf = Buffer.from(message ?? 'blong-test-message');
            return new Promise<{sent: boolean; topic: string; partition: number}>(
                (resolve, reject) => {
                    const ok = stream.write({
                        topic: topic ?? 'blong-test',
                        partition,
                        value: buf,
                    });
                    if (ok) {
                        resolve({sent: true, topic: topic ?? 'blong-test', partition});
                    } else {
                        stream.once('drain', () =>
                            resolve({sent: true, topic: topic ?? 'blong-test', partition}),
                        );
                        stream.once('error', reject);
                    }
                },
            );
        },
);
