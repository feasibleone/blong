import {
    CopyObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    type GetObjectCommandOutput,
    HeadObjectCommand,
    ListBucketsCommand,
    ListObjectsV2Command,
    PutObjectCommand,
    S3Client,
} from '@aws-sdk/client-s3';
import {Upload} from '@aws-sdk/lib-storage';
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

/** The answer a `get` makes: the object buffered whole, for the callers that expect bytes. */
export async function s3BufferAnswer(response: GetObjectCommandOutput) {
    return {
        body: await response.Body?.transformToByteArray(),
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        metadata: response.Metadata,
        lastModified: response.LastModified,
        etag: response.ETag,
    };
}

/**
 * The answer a `stream` makes: the object as a stream, with the headers a reader needs to hand it on.
 *
 * Nothing is buffered, so a caller serving a file never holds it — and `range` comes back as
 * `contentRange`, which is what a `206` answer carries (@@D-838).
 */
export function s3StreamAnswer(response: GetObjectCommandOutput) {
    return {
        body: response.Body as unknown as Readable,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        contentRange: response.ContentRange,
        acceptRanges: response.AcceptRanges,
        metadata: response.Metadata,
        lastModified: response.LastModified,
        etag: response.ETag,
    };
}

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
                      /** An HTTP range (`bytes=0-1023`), honoured by the `stream` operation. */
                      range?: string;
                      sourceBucket?: string;
                      sourceKey?: string;
                  } & Record<string, unknown>)
                | unknown[],
            $meta: IMeta,
        ) {
            const {method} = $meta;
            const [, object, operation] = method!.split('.');
            if (process.env['BLOB_S3_DEBUG'])
                console.log('S3-EXEC', JSON.stringify({method, object, operation}));
            let bucket: string | undefined;
            let actualParams = params;

            if (!Array.isArray(params) && params.bucket) {
                bucket = params.bucket;
                const {bucket: _bucketParam, ...rest} = params;
                actualParams = rest;
            }

            // Bucket enumeration (`s3.bucket.list`) does not need a target bucket.
            const needsBucket = !(
                object === 'bucket' &&
                (operation === 'list' || operation === 'find')
            );
            if (!bucket && !this.config.bucket?.Bucket && needsBucket) {
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
                    return s3BufferAnswer(response);
                }
                case 'stream': {
                    // The same object as `get`, answered as a stream: a caller that serves a file hands
                    // the bytes on without ever holding them (@@D-838). `range` asks for a slice, which
                    // is what a `Range:` request turns into.
                    if (Array.isArray(actualParams)) {
                        throw this.error(_errors['s3.invalid'](), $meta);
                    }
                    const {key, range} = actualParams as {key?: string; range?: string};
                    if (!key) {
                        throw this.error(_errors['s3.missingKey']({key: 'key'}), $meta);
                    }

                    const command = new GetObjectCommand({
                        Bucket: bucket ?? this.config.bucket?.Bucket ?? '',
                        Key: key,
                        ...(range ? {Range: range} : {}),
                    });
                    const response = await this.config.context.s3!.send(command);
                    return s3StreamAnswer(response);
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

                    // A stream whose length nobody knows — a file being encrypted as it is read, a
                    // response being forwarded — cannot be a `PutObject`: the request signs its length
                    // before the first byte exists, so the SDK refuses it with
                    // `Invalid value "undefined" for header "x-amz-decoded-content-length"`, or the server
                    // answers `MissingContentLength`. The SDK's own uploader splits such a body into parts
                    // and holds one part at a time, which is what serving a large file needs (@@D-838).
                    const streamed =
                        contentLength === undefined &&
                        body != null &&
                        typeof (body as {pipe?: unknown}).pipe === 'function';
                    const putResult = streamed
                        ? await new Upload({
                              client: this.config.context.s3!,
                              params: {
                                  Bucket: bucket ?? this.config.bucket?.Bucket ?? '',
                                  Key: key,
                                  Body: body as import('@aws-sdk/client-s3').PutObjectCommandInput['Body'],
                                  ContentType: contentType ?? undefined,
                                  Metadata: metadata,
                              },
                          }).done()
                        : await this.config.context.s3!.send(
                              new PutObjectCommand({
                                  Bucket: bucket ?? this.config.bucket?.Bucket ?? '',
                                  Key: key,
                                  Body: body as import('@aws-sdk/client-s3').PutObjectCommandInput['Body'],
                                  ContentType: contentType ?? undefined,
                                  ...(contentLength != null &&
                                      contentLength > 0 && {ContentLength: contentLength}),
                                  Metadata: metadata,
                              }),
                          );
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
                    // `s3.bucket.list` — enumerate buckets on the endpoint
                    if (object === 'bucket') {
                        const command = new ListBucketsCommand({});
                        const response = await this.config.context.s3!.send(command);
                        return {
                            items:
                                response.Buckets?.map(b => ({
                                    bucket: b.Name,
                                    creationDate: b.CreationDate,
                                })) ?? [],
                        };
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
            console.log(
                'S3-FALLTHROUGH',
                JSON.stringify({method: $meta?.method, object, operation}),
            );
            throw this.error(_errors['s3.generic']({}), $meta);
        },
    };
});
