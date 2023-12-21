import { validation } from '@feasibleone/blong';

export default validation(({lib: {Type}}) => function loginTokenCreate() {
    return {
        auth: 'login',
        params: Type.Object({
            username: Type.String(),
            password: Type.String()
        }),
        result: Type.Object({}, {additionalProperties: true})
    };
});
