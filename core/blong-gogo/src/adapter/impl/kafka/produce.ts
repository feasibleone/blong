/**
 * Writing one record, and the report that says where the broker put it (`@@T-787`).
 */
import type {IKafkaClients, IKafkaHeader, IKafkaProducer, KafkaProducerConfig} from './clients.ts';
import {whenReady} from './clients.ts';

/** A record on its way out, in the shape a caller writes it. */
export interface IOutboundMessage {
    topic: string;
    value: string;
    key?: string | null;
    partition?: number;
    /** Carried beside the value untouched — a dead letter says what failed and how often. */
    headers?: IKafkaHeader[];
}

/**
 * The config a producer that answers with a delivery report is made with.
 *
 * `dr_cb` is what makes librdkafka report at all. `linger.ms` of zero is what makes the report
 * arrive: the default batches for 5 ms, which was 6 of the 6.7 ms a waited send took — a frame a
 * page is waiting for has nothing to gain from that batching, and a batch that wants coalescing
 * asks for it in its own config.
 */
export const reportProducerConfig = (
    connection: KafkaProducerConfig,
): KafkaProducerConfig => ({
    ...connection,
    dr_cb: true,
    'linger.ms': 0,
});

/**
 * `{ns}.message.send` — one message, and where the broker put it (`@@T-787`).
 *
 * `dr_cb` is what makes librdkafka report at all: without it the produce is fire and forget and
 * this promise would never settle. The correlation object is the only thing tying a report to a
 * produce — several may be in flight for one producer, and the broker does not answer in order.
 */
export async function messageSend(
    clients: IKafkaClients,
    connection: KafkaProducerConfig,
    message: IOutboundMessage,
    options: {timeoutMs?: number; producer?: IKafkaProducer} = {},
): Promise<{topic: string; partition: number; offset: number}> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    // A producer handed in belongs to the adapter and outlives this call; one made here belongs to
    // the call and is closed when it has answered.
    const owned = !options.producer;
    const producer = options.producer ?? clients.producer(reportProducerConfig(connection));
    const correlation = {};
    try {
        // A producer the adapter already made is connected; asking again would leave a `ready`
        // listener behind on every send.
        if (!producer.isConnected()) await whenReady(producer);
        // A delivery report is an event, and librdkafka only raises events to a client that
        // polls. The interval is the whole latency of a send that waits for its report: ten
        // milliseconds measured 87 messages a second, one measures the broker instead. Idle polls
        // cost nothing, so the timetable is set for the send that waits.
        producer.setPollInterval(1);
        const report = new Promise<{partition: number; offset: number}>((resolve, reject) => {
            const settle = (): void => {
                clearTimeout(timer);
                producer.off('delivery-report', onReport);
            };
            const timer = setTimeout(() => {
                settle();
                reject(
                    new Error(
                        `Kafka answered no delivery report for ${message.topic} in ${timeoutMs}ms`,
                    ),
                );
            }, timeoutMs);
            const onReport = (
                error: {message?: string} | null,
                delivered?: {topic: string; partition: number; offset: number; opaque?: unknown},
            ): void => {
                // A report that names no partition cannot be matched to a produce; one send per
                // correlation is in flight here, so such a report belongs to the awaited message.
                if (delivered && delivered.opaque !== correlation) return;
                settle();
                if (error) {
                    reject(new Error(error.message ?? 'Kafka delivery failed'));
                    return;
                }
                if (!delivered) {
                    reject(new Error(`Kafka reported no partition for ${message.topic}`));
                    return;
                }
                resolve({partition: delivered.partition, offset: delivered.offset});
            };
            producer.on('delivery-report', onReport);
        });
        // A produce that throws must not leave the report's rejection unobserved: the promise is
        // settled either way, and the caller is told by the throw.
        void report.catch(() => undefined);
        producer.produce(
            message.topic,
            message.partition ?? null,
            Buffer.from(message.value),
            message.key ?? null,
            undefined,
            correlation,
            message.headers,
        );
        const landed = await report;
        return {topic: message.topic, ...landed};
    } finally {
        if (owned) {
            try {
                producer.flush(5_000);
            } catch {
                // The report has already answered the call; a busy queue changes nothing.
            }
            try {
                producer.disconnect();
            } catch {
                // A producer that never connected has nothing to leave behind.
            }
        }
    }
}
