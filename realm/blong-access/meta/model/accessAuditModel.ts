import {model} from '@feasibleone/blong';

/**
 * accessAuditModel — browse-only view of the authentication audit log.
 *
 * The audit log is append-only (`access_audit`, ULID PK, not
 * resource-backed). No Create/Edit/Delete toolbar — the entity is not editable
 * from the UI.
 */
export default model(
    () =>
        async function accessAuditModel() {
            return {
                subject: 'access',
                object: 'audit',
                objectTitle: 'Audit',
                public: true,
                nameField: 'audit.auditId',

                schema: {
                    properties: {
                        audit: {
                            properties: {
                                auditId: {
                                    title: 'Audit',
                                    filter: true,
                                },
                                userId: {title: 'User'},
                                actorId: {title: 'Actor'},
                                sessionId: {title: 'Session'},
                                actionName: {
                                    title: 'Action',
                                    filter: true,
                                },
                                credentialType: {
                                    title: 'Type',
                                    filter: true,
                                },
                                ipAddress: {title: 'IP'},
                                isSuccess: {
                                    title: 'Success',
                                    type: 'boolean',
                                },
                                failureReason: {title: 'Failure Reason'},
                                statusCode: {title: 'HTTP'},
                                occurredAt: {
                                    title: 'Occurred',
                                    widget: {type: 'dateTime'},
                                },
                            },
                            widget: {
                                columns: [
                                    'occurredAt',
                                    'actionName',
                                    'actorId',
                                    'sessionId',
                                    'statusCode',
                                    'userId',
                                    'credentialType',
                                    'ipAddress',
                                    'isSuccess',
                                ],
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Audit Log',
                        widgets: ['audit'],
                    },
                },

                browser: {
                    title: 'Audit Log',
                    icon: 'pi pi-list',
                    toolbar: [],
                },
            };
        },
);
