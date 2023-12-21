import { handler } from '@feasibleone/blong';

export default handler(({
    lib: {
        token
    }
}) => function loginTokenCreate({username, password}, {auth: {mlek, mlsk}}) {
    return token({
        clientId: username,
        actorId: 0,
        sessionId: 'session',
        language: 'en',
        refresh: '',
        permissionMap: '',
        mlek,
        mlsk
    });
});
