import {type IMeta, handler} from '@feasibleone/blong';

export default handler(({lib: {group}, handler: {testNumberSum}}) => ({
    testNumberSumReuse: ({name = 'number sum reuse'}: {name?: string}, $meta: IMeta) =>
        group(name)([
            testNumberSum({name: 'default'}, $meta),
            testNumberSum({name: 'reused with same params'}, $meta),
        ]),
}));
