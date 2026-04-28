import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({lib: {group}, handler: {storageObjectAdd, storageObjectGet}}) => ({
    testS3ObjectPut: ({name = 's3 object put/get round-trip'}, $meta) =>
        group(name)([
            async function putObject(assert: typeof Assert, {$meta}) {
                const testContent = 'blong-s3-test-' + Date.now();
                const result = await storageObjectAdd(
                    {key: 'test/blong-test.txt', body: testContent, contentType: 'text/plain'},
                    $meta,
                );
                assert.ok(result, 'Put should return a result');
                return {key: 'test/blong-test.txt', content: testContent};
            },
            async function getObject(assert: typeof Assert, {$meta}, {key}: {key: string}) {
                const result = await storageObjectGet({key}, $meta);
                assert.ok(result, 'Get should return a result');
                return result;
            },
        ]),
}));
