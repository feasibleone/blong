import {handler, type IMeta} from '@feasibleone/blong';

export default handler(({lib: {group}, handler: {loginTokenCreate}}) => ({
    testLoginTokenCreate: ({name = 'login token'}) =>
        group(name)([
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
        ]),
}));
