import {handler} from '@feasibleone/blong';

export default handler(({handler: {subjectNumberSum, subjectHello}, lib: {sum}}) => ({
    subjectObjectSend(params: unknown, $meta: unknown) {
        subjectNumberSum(params, $meta);
        return super.send(params, $meta);
    },
    subjectObjectReceive: (params, $meta) => {
        subjectHello(params, $meta);
        sum(params);
    },
}));
