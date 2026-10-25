import {model} from '@feasibleone/blong';

/** `sportClubModel` — organisation fields + the club profile. @@D-595 */
export default model(
    () =>
        async function sportClubModel() {
            return {
                subject: 'sport',
                object: 'club',
                objectTitle: 'Sports Club',
                public: true,
                nameField: 'club.legalName',
                schema: {
                    properties: {
                        club: {
                            properties: {
                                legalName: {title: 'Legal Name', required: true, filter: true},
                                clubShortName: {title: 'Short Name'},
                                registrationNumber: {title: 'Registration No'},
                                sportId: {title: 'Sport', widget: {dropdown: 'sport.sport'}},
                                clubStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'active', label: 'Active'},
                                            {value: 'inactive', label: 'Inactive'},
                                        ],
                                    },
                                },
                                registerIdentifier: {title: 'MYS Register ID'},
                                clubNote: {title: 'Notes', widget: {type: 'textArea'}},
                            },
                            widget: {
                                columns: ['legalName', 'clubShortName', 'sportId', 'clubStatus'],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Clubs', widgets: ['club']},
                    identity: {
                        label: 'Club',
                        widgets: [
                            'club.legalName',
                            'club.clubShortName',
                            'club.registrationNumber',
                            'club.sportId',
                            'club.clubStatus',
                            'club.registerIdentifier',
                            'club.clubNote',
                        ],
                    },
                },
                layouts: {edit: [['identity']]},
                browser: {
                    title: 'Clubs',
                    icon: 'pi pi-home',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.club.new',
                            permission: 'sport.club.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.club.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected club?',
                            method: 'sport.club.remove',
                            params: {clubId: '${clubId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
