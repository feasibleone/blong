import { handler, type IMeta } from '@feasibleone/blong/types';

export default handler(({handler: {loginTokenCreate}}) => ({
    testLoginTokenCreate: (_params: {}, $meta: IMeta) => [
        function login(assert: unknown, {$meta}: {$meta: IMeta}) {
            console.log('create login token');
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
