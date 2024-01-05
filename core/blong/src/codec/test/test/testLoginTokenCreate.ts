import {handler, type IMeta} from '../../../../types.js';

export default handler(({handler: {loginTokenCreate}}) => ({
    testLoginTokenCreate: ({name = 'login token'}) =>
        Object.defineProperty<unknown>(
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
            'name',
            {value: name}
        ),
}));
