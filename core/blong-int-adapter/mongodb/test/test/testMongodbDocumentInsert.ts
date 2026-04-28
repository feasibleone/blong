import {handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({lib: {group}, handler: {mongoDocumentAdd, mongoDocumentFind}}) => ({
        testMongodbDocumentInsert: ({name = 'mongodb document insert'}, $meta) =>
            group(name)([
                async function insertDocument(assert: typeof Assert, {$meta}) {
                    const testData = {testField: 'hello-from-blong-test', testTs: Date.now()};
                    const result = await mongoDocumentAdd(testData, $meta);
                    assert.ok(result, 'Insert should return a result');
                    assert.ok(
                        (result as {insertedId?: unknown}).insertedId,
                        'Insert should return an insertedId',
                    );
                    return result;
                },
                async function findDocuments(assert: typeof Assert, {$meta}) {
                    const result = await mongoDocumentFind(
                        {testField: 'hello-from-blong-test'},
                        $meta,
                    );
                    assert.ok(Array.isArray(result), 'Find should return an array');
                    assert.ok(
                        (result as unknown[]).length > 0,
                        'Find should return at least one document',
                    );
                    return result;
                },
            ]),
    }),
);
