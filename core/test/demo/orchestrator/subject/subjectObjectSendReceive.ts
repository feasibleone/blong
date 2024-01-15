import {handler} from '@feasibleone/blong';

export default handler(({handler: {subjectNumberSum, subjectHello}, lib: {sum}}) => ({
    async subjectObjectSend(params: number[], $meta: unknown) {
        await subjectNumberSum(params, $meta);
        return super.send(params, $meta);
    },
    subjectObjectReceive: async (params, $meta) => {
        await subjectHello(params, $meta);
        sum(params);
    },
}));
