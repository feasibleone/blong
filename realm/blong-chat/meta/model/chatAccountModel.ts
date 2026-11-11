import {model} from '@feasibleone/blong';

/** The platforms a chat account may be one of; the port decides what each field means. */
const PLATFORM_OPTIONS = [
    {value: 'slack', label: 'Slack'},
    {value: 'viber', label: 'Viber'},
];

const STATUS_OPTIONS = [
    {value: 'enabled', label: 'Enabled'},
    {value: 'disabled', label: 'Disabled'},
];

/**
 * `chatAccountModel` — the bot accounts this deployment serves, managed from the portal.
 *
 * The row is the account the platform port reads: the two ids an incoming request names, the
 * credential each half of the conversation is made with, and the workspace whose configuration token
 * maintains the app. The alias is the port's key, so it is the name a person chooses carefully; the
 * signing secret and the bot token are what Slack shows after the app is installed, and the
 * configuration token is **not here** — it belongs to the workspace and is edited on that page
 * (`@@D-797`).
 *
 * The list answers the credentials **masked** and the single record answers them: a table of accounts
 * is a table of secrets, read by whoever may open the page, while the one form that has to replace a
 * token needs the value it is replacing (`@@T-625`). A save that carries the mask back leaves the
 * stored secret alone.
 */
export default model(
    () =>
        async function chatAccountModel() {
            return {
                subject: 'chat',
                object: 'account',
                objectTitle: 'Chat account',
                public: true,
                deletion: {mode: 'prompt'},
                menu: {group: 'Chat'},
                nameField: 'account.accountAlias',
                schema: {
                    properties: {
                        account: {
                            properties: {
                                accountAlias: {
                                    title: 'Alias',
                                    required: true,
                                    filter: true,
                                    sort: true,
                                },
                                platform: {
                                    title: 'Platform',
                                    required: true,
                                    widget: {type: 'select', options: PLATFORM_OPTIONS},
                                },
                                workspace: {
                                    title: 'Workspace',
                                    filter: true,
                                    // A text field rather than a dropdown: the workspace table is a
                                    // plain one, and the generated dropdown list only offers
                                    // resource-backed tables. The alias has to match exactly, which
                                    // is what makes a rotation land on the row it came from.
                                },
                                accountStatus: {
                                    title: 'Status',
                                    default: 'enabled',
                                    widget: {type: 'select', options: STATUS_OPTIONS},
                                },
                                appId: {title: 'App ID'},
                                clientId: {title: 'Client ID'},
                                botToken: {title: 'Bot token', widget: {type: 'textArea'}},
                                signingSecret: {
                                    title: 'Signing secret',
                                    widget: {type: 'textArea'},
                                },
                                authToken: {title: 'Auth token', widget: {type: 'textArea'}},
                                apiUrl: {title: 'API base'},
                                publicUrl: {title: 'Public base'},
                            },
                            widget: {
                                columns: [
                                    'accountAlias',
                                    'platform',
                                    'workspace',
                                    'appId',
                                    'accountStatus',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Chat accounts', widgets: ['account']},
                    main: {
                        label: 'Account',
                        widgets: [
                            'account.accountAlias',
                            'account.platform',
                            'account.workspace',
                            'account.accountStatus',
                            'account.publicUrl',
                            'account.apiUrl',
                        ],
                    },
                    app: {
                        label: 'Slack app',
                        widgets: [
                            'account.appId',
                            'account.clientId',
                            'account.botToken',
                            'account.signingSecret',
                            'account.authToken',
                        ],
                    },
                },
                layouts: {edit: [['main'], ['app']]},
                browser: {
                    navigator: false,
                    title: 'Chat accounts',
                    icon: 'pi pi-comments',
                    // The generic `find` answers `{items, pagination}`, so the page takes the rows
                    // from `items` rather than from the response itself.
                    resultSet: 'items',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/chat.account.new',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/chat.account.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected chat account?',
                            method: 'chat.account.remove',
                            params: {accountId: '${accountId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
