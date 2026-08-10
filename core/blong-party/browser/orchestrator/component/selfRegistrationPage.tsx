import {SelfRegistration, useBlong} from '@feasibleone/blong-browser';
import React from 'react';

/**
 * Wires the blong-browser `SelfRegistration` full-screen form to the party
 * suite's backend: `authRegister` (register + auto-login) and the Google OAuth
 * redirect.
 */
export function SelfRegistrationPage() {
    const {handler} = useBlong();
    const onRegister = React.useCallback(
        async (credentials: {
            emailAddress: string;
            password: string;
            firstName: string;
            lastName: string;
        }) => {
            await handler.authRegister(credentials, {});
        },
        [handler],
    );
    const onGoogle = React.useCallback(() => {
        void handler.authGoogleRedirect({}, {});
    }, [handler]);

    return (
        <SelfRegistration
            title="Blong Party"
            orgTitle="Feasible One"
            onRegister={onRegister}
            onGoogle={onGoogle}
        />
    );
}
