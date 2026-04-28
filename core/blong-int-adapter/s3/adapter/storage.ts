import {adapter} from '@feasibleone/blong';

export default adapter<{
    s3: {
        region?: string;
        endpoint?: string;
        credentials?: {accessKeyId: string; secretAccessKey: string};
        forcePathStyle?: boolean;
    };
    bucket?: {Bucket?: string};
}>(api => ({
    extends: 'adapter.s3',
    activation: {
        default: {
            s3: {
                region: 'us-east-1',
                endpoint: 'http://localhost:30009',
                credentials: {
                    accessKeyId: 'minioadmin',
                    secretAccessKey: 'minioadmin',
                },
                forcePathStyle: true,
            },
            bucket: {Bucket: 'blong-integration'},
            namespace: 'storage',
            imports: [],
        },
    },
}));
