import {IMeta, handler} from '@feasibleone/blong';

export default handler(
    ({lib: {token}}) =>
        function loginTokenCreate(
            {username, password}: {username: string; password: string},
            {auth: {mlek, mlsk}}: IMeta
        ) {
            return token({
                clientId: username,
                actorId: 0,
                sessionId: 'session',
                language: 'en',
                refresh: '',
                permissionMap: '',
                mlek,
                mlsk,
            });
        }
);
