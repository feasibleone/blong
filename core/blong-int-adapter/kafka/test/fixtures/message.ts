/**
 * Fixture data for Kafka integration tests.
 * Used by testKafkaMessageRoundtrip to verify produce/consume round-trips
 * with various payload shapes.
 */

export const messages = [
    {
        topic: 'blong-integration',
        payload: 'blong-integration-roundtrip-test',
        source: 'blong-kafka-test',
    },
    {
        topic: 'blong-integration',
        payload: 42,
        source: 'blong-kafka-numeric-test',
    },
    {
        topic: 'blong-integration',
        payload: {nested: true, depth: 1},
        source: 'blong-kafka-object-test',
    },
] as const;
