import {
    CopyObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import {adapter, type Errors, type IErrorMap, type IMeta} from '@feasibleone/blong';
import {createReadStream, statSync} from 'fs';
import {Readable} from 'stream';

export interface IConfig {
    s3: {
        region?: string;
        endpoint?: string;
        credentials?: {
            accessKeyId: string;
            secretAccessKey: string;
        };
        forcePathStyle?: boolean;
    };
    bucket?: {
        Bucket: string;
    };
    url?: string;
    context: {
        s3: S3Client;
    };
}

const errorMap: IErrorMap = {
    's3.generic': 'S3 Error',
    's3.invalid': 'Invalid S3 Operation',
    's3.notFound': 'S3 Object Not Found',
    's3.exists': 'S3 Object Already Exists',
    's3.accessDenied': 'S3 Access Denied',
    's3.missingKey': 'Missing key value for {key}',
    's3.missingBucket': 'Missing bucket parameter',
};

let _errors: Errors<typeof errorMap>;

export default adapter<IConfig>(({utError}) => {
    _errors ||= utError.register(errorMap);

    return {
        async init(...configs: object[]) {
            await super.init(
                {
                    type: 's3',
                    s3: {
                        requestStreamBufferSize: 64 * 1024,
                    },
                    bucket: {},
                },
                ...configs,
            );
        },
        async start() {
            this.config.context = {s3: new S3Client(this.config.s3)};
            super.connect();
            return super.start();
        },
        async stop(...params: unknown[]) {
            let result;
            try {
                this.config.context.s3.destroy();
            } finally {
                this.config.context = null;
                result = await super.stop(...params);
            }
            return result;
        },
        async exec(
            params:
                | ({
                      bucket?: string;
                      key?: string;
                      body?: PutObjectCommand['input']['Body'];
                      url?: string;
                      contentType?: string;
                      metadata?: Record<string, string>;
                      prefix?: string;
                      maxKeys?: number;
                      sourceBucket?: string;
                      sourceKey?: string;
                  } & Record<string, unknown>)
                | unknown[],
            {method}: IMeta,
        ) {
            const [, resource, operation] = method.split('.');
            let bucket: string | undefined;
            let actualParams = params;

            if (!Array.isArray(params) && params.bucket) {
                bucket = params.bucket;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const {bucket: _bucketParam, ...rest} = params;
                actualParams = rest;
            }

            if (!bucket && !this.config.bucket.Bucket) throw _errors['s3.missingBucket']();

            switch (operation) {
                case 'get': {
                    // Get object from S3
                    if (Array.isArray(actualParams)) throw _errors['s3.invalid']();
                    const {key} = actualParams;
                    if (!key) throw _errors['s3.missingKey']({key: 'key'});

                    const command = new GetObjectCommand({
                        ...this.config.bucket,
                        ...(bucket && {Bucket: bucket}),
                        Key: key,
                    });
                    const response = await this.config.context.s3.send(command);
                    return {
                        body: await response.Body?.transformToByteArray(),
                        contentType: response.ContentType,
                        contentLength: response.ContentLength,
                        metadata: response.Metadata,
                        lastModified: response.LastModified,
                        etag: response.ETag,
                    };
                }
                case 'add': {
                    // Put object to S3
                    if (Array.isArray(actualParams)) throw _errors['s3.invalid']();
                    const {url, key, metadata} = actualParams;
                    let {body, contentType} = actualParams;
                    if (!key) throw _errors['s3.missingKey']({key: 'key'});
                    let contentLength: number | undefined;
                    if (url && !body) {
                        if (/^https?:\/\//.test(url)) {
                            try {
                                const response = await fetch(url);
                                contentType ||= response.headers.get('content-type');
                                contentLength = Number(response.headers.get('content-length'));
                                body =
                                    contentLength > 0
                                        ? Readable.fromWeb(response.body)
                                        : Buffer.from(await response.arrayBuffer());
                            } catch (error) {
                                this.log?.error?.(
                                    `Error fetching report from ${url}: ${error.message}`,
                                );
                                throw error;
                            }
                        } else {
                            contentLength = statSync(url).size;
                            body = createReadStream(url);
                            contentType ||= 'text/html';
                        }
                    }

                    if (body === undefined) throw _errors['s3.missingKey']({key: 'body'});

                    const command = new PutObjectCommand({
                        ...this.config.bucket,
                        ...(bucket && {Bucket: bucket}),
                        Key: key,
                        Body: body,
                        ContentType: contentType,
                        ...(contentLength > 0 && {ContentLength: contentLength}),
                        Metadata: metadata,
                    });
                    await this.config.context.s3.send(command);
                    return this.config.url?.replace?.('{key}', key);
                }
                case 'delete':
                case 'remove': {
                    // Delete object from S3
                    if (Array.isArray(actualParams)) throw _errors['s3.invalid']();
                    const {key} = actualParams;
                    if (!key) throw _errors['s3.missingKey']({key: 'key'});

                    const command = new DeleteObjectCommand({
                        ...this.config.bucket,
                        ...(bucket && {Bucket: bucket}),
                        Key: key,
                    });
                    return this.config.context.s3.send(command);
                }
                case 'list':
                case 'find': {
                    // List objects in S3 bucket
                    if (Array.isArray(actualParams)) throw _errors['s3.invalid']();
                    const {prefix, maxKeys = 1000} = actualParams;

                    const command = new ListObjectsV2Command({
                        ...this.config.bucket,
                        ...(bucket && {Bucket: bucket}),
                        Prefix: prefix,
                        MaxKeys: maxKeys,
                    });
                    return this.config.context.s3.send(command);
                }
                case 'head':
                case 'metadata': {
                    // Get object metadata
                    if (Array.isArray(actualParams)) throw _errors['s3.invalid']();
                    const {key} = actualParams;
                    if (!key) throw _errors['s3.missingKey']({key: 'key'});

                    const command = new HeadObjectCommand({
                        ...this.config.bucket,
                        ...(bucket && {Bucket: bucket}),
                        Key: key,
                    });
                    return this.config.context.s3.send(command);
                }
                case 'copy': {
                    // Copy object within S3
                    if (Array.isArray(actualParams)) throw _errors['s3.invalid']();
                    const {key, sourceBucket, sourceKey} = actualParams;
                    if (!key) throw _errors['s3.missingKey']({key: 'key'});
                    if (!sourceBucket) throw _errors['s3.missingKey']({key: 'sourceBucket'});
                    if (!sourceKey) throw _errors['s3.missingKey']({key: 'sourceKey'});

                    const command = new CopyObjectCommand({
                        ...this.config.bucket,
                        ...(bucket && {Bucket: bucket}),
                        Key: key,
                        CopySource: `${sourceBucket}/${sourceKey}`,
                    });
                    return this.config.context.s3.send(command);
                }
            }
            throw _errors['s3.generic']();
        },
    };
});
