import {
    CopyObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import {adapter, type Errors, type IErrorMap, type IMeta} from '@feasibleone/blong/types';
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
        requestStreamBufferSize?: number;
    };
    bucket?: {
        Bucket?: string;
    };
    url?: string;
    context: {
        s3?: S3Client;
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
        activation: {
            default: {
                type: 's3',
                s3: {
                    requestStreamBufferSize: 64 * 1024,
                },
                bucket: {},
            },
        },
        async start() {
            this.config.context = {s3: new S3Client(this.config.s3)};
            super.connect();
            return super.start();
        },
        async stop(...params: unknown[]) {
            let result;
            try {
                this.config.context.s3!.destroy();
            } finally {
                this.config.context = {};
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
            $meta: IMeta,
        ) {
            const {method} = $meta;
            const [, , operation] = method!.split('.');
            let bucket: string | undefined;
            let actualParams = params;

            if (!Array.isArray(params) && params.bucket) {
                bucket = params.bucket;
                const {bucket: _bucketParam, ...rest} = params;
                actualParams = rest;
            }

            if (!bucket && !this.config.bucket?.Bucket) {
                throw this.error(_errors['s3.missingBucket'](), $meta);
            }

            switch (operation) {
                case 'get': {
                    // Get object from S3
                    if (Array.isArray(actualParams)) {
                        throw this.error(_errors['s3.invalid'](), $meta);
                    }
                    const {key} = actualParams;
                    if (!key) {
                        throw this.error(_errors['s3.missingKey']({key: 'key'}), $meta);
                    }

                    const command = new GetObjectCommand({
                        Bucket: bucket ?? this.config.bucket?.Bucket ?? '',
                        Key: key,
                    });
                    const response = await this.config.context.s3!.send(command);
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
                    if (Array.isArray(actualParams)) {
                        throw this.error(_errors['s3.invalid'](), $meta);
                    }
                    const {url, key, metadata} = actualParams;
                    let {body, contentType} = actualParams;
                    if (!key) {
                        throw this.error(_errors['s3.missingKey']({key: 'key'}), $meta);
                    }
                    let contentLength: number | undefined;
                    if (url && !body) {
                        if (/^https?:\/\//.test(url)) {
                            try {
                                const response = await fetch(url);
                                contentType ||= response.headers.get('content-type') ?? undefined;
                                contentLength = Number(response.headers.get('content-length'));
                                body =
                                    contentLength > 0
                                        ? Readable.fromWeb(
                                              response.body as import('stream/web').ReadableStream,
                                          )
                                        : Buffer.from(await response.arrayBuffer());
                            } catch (error) {
                                this.log?.error?.(
                                    `Error fetching report from ${url}: ${(error as Error).message}`,
                                );
                                throw error;
                            }
                        } else {
                            contentLength = statSync(url).size;
                            body = createReadStream(url);
                            contentType ||= 'text/html';
                        }
                    }

                    if (body === undefined) {
                        throw this.error(_errors['s3.missingKey']({key: 'body'}), $meta);
                    }

                    const command = new PutObjectCommand({
                        Bucket: bucket ?? this.config.bucket?.Bucket ?? '',
                        Key: key,
                        Body: body as import('@aws-sdk/client-s3').PutObjectCommandInput['Body'],
                        ContentType: contentType ?? undefined,
                        ...(contentLength != null &&
                            contentLength > 0 && {ContentLength: contentLength}),
                        Metadata: metadata,
                    });
                    const putResult = await this.config.context.s3!.send(command);
                    return this.config.url?.replace?.('{key}', key) ?? {key, etag: putResult.ETag};
                }
                case 'delete':
                case 'remove': {
                    // Delete object from S3
                    if (Array.isArray(actualParams)) {
                        throw this.error(_errors['s3.invalid'](), $meta);
                    }
                    const {key} = actualParams;
                    if (!key) {
                        throw this.error(_errors['s3.missingKey']({key: 'key'}), $meta);
                    }

                    const command = new DeleteObjectCommand({
                        Bucket: bucket ?? this.config.bucket?.Bucket ?? '',
                        Key: key,
                    });
                    return this.config.context.s3!.send(command);
                }
                case 'list':
                case 'find': {
                    // List objects in S3 bucket
                    if (Array.isArray(actualParams)) {
                        throw this.error(_errors['s3.invalid'](), $meta);
                    }
                    const {prefix, maxKeys = 1000} = actualParams;

                    const command = new ListObjectsV2Command({
                        Bucket: bucket ?? this.config.bucket?.Bucket ?? '',
                        Prefix: prefix,
                        MaxKeys: maxKeys,
                    });
                    return this.config.context.s3!.send(command);
                }
                case 'head':
                case 'metadata': {
                    // Get object metadata
                    if (Array.isArray(actualParams)) {
                        throw this.error(_errors['s3.invalid'](), $meta);
                    }
                    const {key} = actualParams;
                    if (!key) {
                        throw this.error(_errors['s3.missingKey']({key: 'key'}), $meta);
                    }

                    const command = new HeadObjectCommand({
                        Bucket: bucket ?? this.config.bucket?.Bucket ?? '',
                        Key: key,
                    });
                    return this.config.context.s3!.send(command);
                }
                case 'copy': {
                    // Copy object within S3
                    if (Array.isArray(actualParams)) {
                        throw this.error(_errors['s3.invalid'](), $meta);
                    }
                    const {key, sourceBucket, sourceKey} = actualParams;
                    if (!key) {
                        throw this.error(_errors['s3.missingKey']({key: 'key'}), $meta);
                    }
                    if (!sourceBucket) {
                        throw this.error(_errors['s3.missingKey']({key: 'sourceBucket'}), $meta);
                    }
                    if (!sourceKey) {
                        throw this.error(_errors['s3.missingKey']({key: 'sourceKey'}), $meta);
                    }

                    const command = new CopyObjectCommand({
                        Bucket: bucket ?? this.config.bucket?.Bucket ?? '',
                        Key: key,
                        CopySource: `${sourceBucket}/${sourceKey}`,
                    });
                    return this.config.context.s3!.send(command);
                }
            }
            throw this.error(_errors['s3.generic']({}), $meta);
        },
    };
});
