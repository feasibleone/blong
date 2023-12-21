import { validation } from '@feasibleone/blong';

export default validation(({lib: {Type}}) => function parkingTest() {
    return {
        auth: false,
        params: Type.Any(),
        result: Type.Any()
    };
});
