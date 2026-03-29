import {type IMeta, handler} from '@feasibleone/blong';

export default handler(({lib: {group}, handler: {testNumberSum}}) => ({
    testNumberSumReuse: ({name = 'number sum reuse'}, $meta) =>
        group(name)([
            testNumberSum({name: 'default'}, $meta),
            testNumberSum({name: 'reused with same params'}, $meta),
        ]),
}));
