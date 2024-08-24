import {IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(
    ({
        lib: {rename},
        handler: {
            testLoginTokenCreate,
            $subject$ObjectGet,
            $subject$ObjectAdd,
            $subject$ObjectEdit,
            $subject$ObjectRemove,
        },
    }) => ({
        test$Object: ({name = '$subject'}, $meta) =>
            rename(
                [
                    testLoginTokenCreate({}, $meta),
                    async function $object(assert: typeof Assert, {$meta}: {$meta: IMeta}) {
                        const {$objectId} = await $subject$ObjectAdd({name: '$object'}, $meta);
                        assert.ok($objectId, '$object add');
                        assert.ok(
                            await $subject$ObjectEdit({$objectId, name: 'new name'}, $meta),
                            '$object edit'
                        );
                        assert.ok(await $subject$ObjectGet({$objectId}, $meta), '$object get');
                        assert.ok(
                            await $subject$ObjectRemove({$objectId}, $meta),
                            '$object remove'
                        );
                    },
                ],
                name
            ),
    })
);
