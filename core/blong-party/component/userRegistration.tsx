import {handler} from '@feasibleone/blong';
import {SelfRegistrationPage} from './userRegistrationPage.js';

export default handler(function userRegistration() {
    return {
        'user.selfRegistration': async () => ({
            title: 'Register',
            component: () => Promise.resolve(SelfRegistrationPage),
        }),
    };
});
