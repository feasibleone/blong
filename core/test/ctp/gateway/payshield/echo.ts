import { validation } from '@feasibleone/blong';

export default validation(({lib: {Type}}) => function payshieldEcho() {
    return {
        params: Type.Any(),
        result: Type.Object({
            data: Type.Any()
        })
    };
});
