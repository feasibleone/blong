import {model} from '@feasibleone/blong';

/**
 * accessPolicyModel — browse-only view of the credential policies.
 *
 * `policyName` is the display name (lives in `core_resource.resourceName`) and
 * is provided by the custom `access.policy.find` handler. No Create/Edit/Delete
 * toolbar — the entity is not editable from the UI.
 */
export default model(
    () =>
        async function accessPolicyModel() {
            return {
                subject: 'access',
                object: 'policy',
                objectTitle: 'Policy',
                public: true,
                nameField: 'policy.policyName',

                schema: {
                    properties: {
                        policy: {
                            properties: {
                                policyName: {
                                    title: 'Name',
                                    filter: true,
                                    sort: true,
                                },
                                credentialType: {
                                    title: 'Type',
                                    filter: true,
                                },
                                minLength: {title: 'Min Length'},
                                maxAgeDays: {title: 'Max Age (days)'},
                                maxAttempts: {title: 'Max Attempts'},
                                isActive: {title: 'Active', type: 'boolean'},
                                // server schema defined:
                                // policyId: {},
                            },
                            widget: {
                                columns: [
                                    'policyName',
                                    'credentialType',
                                    'minLength',
                                    'maxAgeDays',
                                    'isActive',
                                ],
                            },
                        },
                    },
                },

                cards: {
                    browse: {
                        label: 'Policies',
                        widgets: ['policy'],
                    },
                },

                browser: {
                    title: 'Credential Policies',
                    icon: 'pi pi-shield',
                    toolbar: [],
                },
            };
        },
);
