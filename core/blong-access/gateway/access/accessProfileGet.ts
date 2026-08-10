import {validation} from '@feasibleone/blong';

/**
 * Protected RPC endpoint returning the authenticated user's own profile
 * (email + linked party.person).  Granted to the `Guest` role.
 */
export default validation(
    async ({lib: {type}}) =>
        function accessProfileGet() {
            return {
                params: type.Object({}),
                result: type.Object(
                    {
                        userId: type.String(),
                        emailAddress: type.Union([type.String(), type.Null()]),
                        person: type.Optional(
                            type.Object(
                                {
                                    personId: type.String(),
                                    firstName: type.String(),
                                    middleName: type.Union([type.String(), type.Null()]),
                                    lastName: type.String(),
                                    birthDate: type.Union([type.String(), type.Null()]),
                                    gender: type.Union([type.String(), type.Null()]),
                                    nationality: type.Union([type.String(), type.Null()]),
                                    occupation: type.Union([type.String(), type.Null()]),
                                },
                                {additionalProperties: true},
                            ),
                        ),
                    },
                    {additionalProperties: true},
                ),
            };
        },
);
