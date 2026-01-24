import {handler, type IMeta} from '@feasibleone/blong';

export default handler(({lib: {rename}, handler: {loginTokenCreate}}) => ({
    testLoginTokenCreate: ({name = 'login token'}) =>
        rename<{}>(
            [
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
            name,
        ),
}));
