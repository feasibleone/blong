export default {
    default: {
        handler: {
            priority: {
                level: 'high',
                maxRetries: '3',
            },
            cache: {
                ttl: '60000',
                maxSize: '1000',
            },
        },
    },
};
