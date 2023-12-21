import { library } from '@feasibleone/blong';

export default library(proxy => function sum(...params: number[]) {
    return params.reduce((prev, cur) => {
        if (cur < 0) throw proxy.error['subject.sum']();
        return prev + cur;
    }, 0);
});
