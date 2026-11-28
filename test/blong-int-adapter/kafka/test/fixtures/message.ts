/**
 * Fixture data for Kafka integration tests.
 * Used by testKafkaMessageRoundTrip to verify produce/consume round-trips
 * with various payload shapes.
 */

export const messages = [
    {
        topic: 'blong-int-adapter',
        payload: 'blong-int-adapter-round-trip-test',
        source: 'blong-kafka-test',
    },
    {
        topic: 'blong-int-adapter',
        payload: 42,
        source: 'blong-kafka-numeric-test',
    },
    {
        topic: 'blong-int-adapter',
        payload: {nested: true, depth: 1},
        source: 'blong-kafka-object-test',
    },
] as const;
