import {adapter} from '@feasibleone/blong';

/**
 * `s3-dev` adapter instance — S3/MinIO explorer source for the commander dev
 * suite. Namespace `s3-dev` so `s3-dev.bucket.list` / `s3-dev.object.list`
 * reach this instance.
 */
export default adapter<{
    s3: {
        region?: string;
        endpoint?: string;
        credentials?: {accessKeyId: string; secretAccessKey: string};
        forcePathStyle?: boolean;
    };
    bucket?: {Bucket?: string};
}>(() => ({
    extends: 'adapter.s3',
    activation: {
        default: {
            s3: {
                region: 'us-east-1',
                endpoint: 'http://localhost:9000',
                credentials: {
                    accessKeyId: 'blong-admin',
                    secretAccessKey: 'password',
                },
                forcePathStyle: true,
            },
            bucket: {Bucket: 'blong-integration'},
            namespace: 's3-dev',
            imports: [],
        },
    },
}));
