# Test

## Test handlers

Writing tests is very similar to writing handlers and library functions.
The main difference is that the files are in the `test/test` folder,
first `test` being the layer name and the second `test` is part
of the name of the handlers, which becomes `xxx.test`.
The layer name is useful to activate tests only when needed,
while the `xxx.test` is convenient way to find all test handlers
and attach them to the orchestrator where they can run.

Each test must return an array of steps. Each step is a function
or another array of steps. Test handlers receive two arguments:
the first one is parameters for the test, the second one is `$meta`.
The first parameter can optionally include the property `name`,
to give name of the test. This is useful when reusing test handlers
and passing different parameters, the test to be reported in the
output as different test names. The test name must be set as a property
of the returned array. This is done by the `rename` function provided
by the framework, which returns the passed array with the `name` property
set. When the steps of the test are executed, the result of each step
is set in an object called `context`. The name of the function determines
the name of the property within the context, where the result is set.
Tests start with a context, which is an empty object. Subsequent steps can
access the context, so that values from previous tests can be passed to
handlers and other tests. Test steps are called with two parameters:
`assert` and `context`. By default the assert function is the one
coming from `node:assert`, but can be changed to other ones, like
the ones coming from [tap](https://node-tap.org/), which are mainly
useful for [snapshot testing](https://www.npmjs.com/package/@tapjs/snapshot)
with the `matchSnapshot` assertion function, which is not available in
`node:assert`.

Example:

```ts
// realmname/test/test/testSomething.ts
import {IMeta, handler} from '@feasibleone/blong';
import type Assert from 'node:assert';

export default handler(({
    lib: {rename},
    handler: {
        testLoginTokenCreate,
        subjectObjectPredicate
    }
}) => ({
    testSomething: ({name = 'something'}, $meta) =>
        rename([
            testLoginTokenCreate({}, $meta), // reuse another test
            async function testCase(
                assert: typeof Assert,
                {$meta}: {$meta: IMeta}
            ) {
                const result = await subjectObjectPredicate<{data: string}>(
                    {},
                    $meta
                );
                assert.equal(result.data, 'expected data', 'Return expected data');
            }
        ], name)
}));
```
