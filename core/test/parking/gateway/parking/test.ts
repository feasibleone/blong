import { validation } from '@feasibleone/blong';

export default validation(({lib: {Type}}) => function parkingTest() {
    return {
        params: Type.Any(),
        result: Type.Object({
            zone: Type.String(),
            price: Type.Number()
        })
    };
});
