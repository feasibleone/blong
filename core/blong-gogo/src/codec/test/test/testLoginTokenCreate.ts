import {handler, type IMeta} from '@feasibleone/blong';

export default handler(({lib: {rename}, handler: {loginTokenCreate}}) => ({
    testLoginTokenCreate: ({name = 'login token'}) =>
        rename<unknown>(
            [
                function login(assert: unknown, {$meta}: {$meta: IMeta}) {
                    return loginTokenCreate(
                        {
                            username: 'test',
                            password: 'test',
                        },
                        $meta
                    );
                },
            ],
            name
        ),
}));
