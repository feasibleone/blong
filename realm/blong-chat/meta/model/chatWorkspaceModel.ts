import {model} from '@feasibleone/blong';

const STATUS_OPTIONS = [
    {value: 'enabled', label: 'Enabled'},
    {value: 'disabled', label: 'Disabled'},
];

/**
 * `chatWorkspaceModel` — the Slack workspaces whose app configuration this deployment manages.
 *
 * The row holds the **configuration-token pair**, which is workspace-scoped: it authorizes app
 * management for every bot account of the workspace, and a rotation replaces it here once, however
 * many accounts the workspace maintains (`@@D-797`). The accounts page names this row by alias; an
 * account whose workspace is not here keeps its own app but has nothing to maintain it with.
 *
 * `configTokenExpiresAt` is read-only because it is the answer Slack gave the rotation, never a value
 * a person types. An empty expiry means nobody knows, and the port then leaves the pair alone rather
 * than rotating on every start (`@@D-797`).
 */
export default model(
    () =>
        async function chatWorkspaceModel() {
            return {
                subject: 'chat',
                object: 'workspace',
                objectTitle: 'Chat workspace',
                public: true,
                deletion: {mode: 'prompt'},
                menu: {group: 'Chat', order: 1},
                nameField: 'workspace.workspaceName',
                schema: {
                    properties: {
                        workspace: {
                            properties: {
                                workspaceName: {
                                    title: 'Workspace',
                                    required: true,
                                    filter: true,
                                    sort: true,
                                },
                                platform: {
                                    title: 'Platform',
                                    required: true,
                                    default: 'slack',
                                    widget: {
                                        type: 'select',
                                        options: [{value: 'slack', label: 'Slack'}],
                                    },
                                },
                                workspaceStatus: {
                                    title: 'Status',
                                    default: 'enabled',
                                    widget: {type: 'select', options: STATUS_OPTIONS},
                                },
                                configToken: {
                                    title: 'Config token',
                                    widget: {type: 'textArea'},
                                },
                                configRefreshToken: {
                                    title: 'Config refresh token',
                                    widget: {type: 'textArea'},
                                },
                                configTokenExpiresAt: {
                                    title: 'Config token expires',
                                    widget: {type: 'dateTime'},
                                    readOnly: true,
                                },
                            },
                            widget: {
                                columns: [
                                    'workspaceName',
                                    'platform',
                                    'workspaceStatus',
                                    'configTokenExpiresAt',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Chat workspaces', widgets: ['workspace']},
                    main: {
                        label: 'Workspace',
                        widgets: [
                            'workspace.workspaceName',
                            'workspace.platform',
                            'workspace.workspaceStatus',
                        ],
                    },
                    configuration: {
                        label: 'Configuration token',
                        widgets: [
                            'workspace.configToken',
                            'workspace.configRefreshToken',
                            'workspace.configTokenExpiresAt',
                        ],
                    },
                },
                layouts: {edit: [['main'], ['configuration']]},
                browser: {
                    title: 'Chat workspaces',
                    icon: 'pi pi-sitemap',
                    // The generic `find` answers `{items, pagination}`.
                    resultSet: 'items',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/chat.workspace.new',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/chat.workspace.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm:
                                'Delete the selected workspace? Its accounts keep their apps but lose their token.',
                            method: 'chat.workspace.remove',
                            params: {workspaceId: '${workspaceId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
