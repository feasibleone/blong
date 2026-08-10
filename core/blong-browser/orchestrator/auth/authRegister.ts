import {type IMeta, handler} from '@feasibleone/blong';

type RegisterParams = {
    emailAddress: string;
    password: string;
    firstName: string;
    middleName?: string;
    lastName: string;
    birthDate?: string;
    gender?: string;
    nationality?: string;
    occupation?: string;
};

type LoginResult = {
    step: 'success' | 'otp' | 'newPassword' | 'credentials';
    token?: string;
    error?: string;
};

/**
 * Self-registration + auto-login.
 *
 * Creates the account via the public `access.registration.add` endpoint, then
 * logs the new user straight into the portal by reusing the existing
 * `authLogin` flow (token create + storage + permissions).
 */
export default handler(
    ({
        handler: {
            'backend/access.registration.add': accessRegistrationAdd,
            authLogin,
        },
    }) =>
        async function authRegister(params: RegisterParams, $meta: IMeta): Promise<LoginResult> {
            await accessRegistrationAdd(
                {
                    emailAddress: params.emailAddress,
                    password: params.password,
                    firstName: params.firstName,
                    middleName: params.middleName,
                    lastName: params.lastName,
                    birthDate: params.birthDate,
                    gender: params.gender,
                    nationality: params.nationality,
                    occupation: params.occupation,
                },
                $meta,
            );

            return authLogin(
                {username: params.emailAddress, password: params.password},
                $meta,
            );
        },
);
