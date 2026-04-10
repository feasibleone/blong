import {handler, type IMeta} from '@feasibleone/blong/types';

export default handler(({handler: {loginTokenCreate}}) => ({
    testLoginTokenCreate: (_params: {}, $meta: IMeta) => [
        function login(assert: unknown, {$meta}: {$meta: IMeta}) {
            return loginTokenCreate(
                {
                    username: 'test',
                    password: 'test',
                },
                $meta,
            );
        },
    ],
}));
