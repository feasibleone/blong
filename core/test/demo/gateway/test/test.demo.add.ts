import { validation } from '@feasibleone/blong';

export default validation(({lib: {Type}}) => function testDemoAdd() {
    return {
        auth: false,
        params: Type.Any(),
        result: Type.Any()
    };
});
