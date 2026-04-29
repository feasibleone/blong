import {handler, type IMeta} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}, handler: {storageObjectAdd, storageObjectGet}}) => ({
    testS3ObjectPut: ({name = 's3 object put/get round-trip'}: {name?: string}) =>
        group(name)([
            async function putObject(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                const testContent = 'blong-s3-test-' + Date.now();
                const result = await storageObjectAdd(
                    {key: 'test/blong-test.txt', body: testContent, contentType: 'text/plain'},
                    $meta,
                );
                assert.ok(result, 'Put should return a result');
                return {key: 'test/blong-test.txt', content: testContent};
            },
            async function getObject(
                assert: typeof Assert,
                {$meta, putObject}: {$meta: IMeta; putObject: Promise<{key: string}>},
            ) {
                const {key} = await putObject;
                const result = await storageObjectGet({key}, $meta);
                assert.ok(result, 'Get should return a result');
                return result;
            },
        ]),
}));
