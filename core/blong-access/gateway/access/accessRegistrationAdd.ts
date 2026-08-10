import {validation} from '@feasibleone/blong';

/**
 * Public RPC endpoint for self-registration (no session token exists yet).
 * Uses `auth: 'login'` so the gateway's MLE layer decrypts the request body
 * (same pre-auth level as `login.token.create`).
 */
export default validation(
    async ({lib: {type}}) =>
        function accessRegistrationAdd() {
            return {
                auth: 'login',
                params: type.Object({
                    emailAddress: type.String(),
                    password: type.String(),
                    firstName: type.String(),
                    middleName: type.Optional(type.String()),
                    lastName: type.String(),
                    birthDate: type.Optional(type.String()),
                    gender: type.Optional(type.String()),
                    nationality: type.Optional(type.String()),
                    occupation: type.Optional(type.String()),
                }),
                result: type.Object({
                    userId: type.String(),
                    personId: type.String(),
                    emailAddress: type.String(),
                }),
            };
        },
);
