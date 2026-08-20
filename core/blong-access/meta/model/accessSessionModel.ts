import {model} from '@feasibleone/blong';

/**
 * accessSessionModel — browse view of the active sessions.
 *
 * Sessions are standalone rows (`access_session`) written on authentication
 * and refreshed on token renewal. The "Close Session" toolbar button calls the
 * custom `access.session.close` action to revoke the selected session.
 */
export default model(
    () =>
        async function accessSessionModel() {
            return {
                subject: 'access',
                object: 'session',
                objectTitle: 'Session',
                public: true,
                nameField: 'session.sessionId',

                schema: {
                    properties: {
                        session: {
                            properties: {
                                sessionId: {
                                    title: 'Session',
                                    filter: true,
                                },
                                userId: {title: 'User'},
                                issuedAt: {
                                    title: 'Issued',
                                    widget: {type: 'dateTime'},
                                },
                                expiresAt: {
                                    title: 'Expires',
                                    widget: {type: 'dateTime'},
                                },
                                ipAddress: {title: 'IP'},
                                isRevoked: {
                                    title: 'Revoked',
                                    type: 'boolean',
                                },
                            },
                            widget: {
                                columns: [
                                    'sessionId',
                                    'userId',
                                    'issuedAt',
                                    'expiresAt',
                                    'ipAddress',
                                    'isRevoked',
                                ],
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Sessions',
                        widgets: ['session'],
                    },
                },

                browser: {
                    title: 'Sessions',
                    icon: 'pi pi-clock',
                    toolbar: [
                        {
                            label: 'Close Session',
                            icon: 'pi pi-times',
                            enabled: 'current',
                            confirm: 'Close this session?',
                            method: 'access.session.close',
                            params: '${current}',
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
