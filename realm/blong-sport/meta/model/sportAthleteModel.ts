import {model} from '@feasibleone/blong';

/**
 * `sportAthleteModel` — the athlete page.
 *
 * The payload is flat (`athlete.firstName`), because the profile table shares
 * the party PK and the handler splits the two halves. @@D-595 @@D-596
 *
 * Cards follow the groups of model.md chapter III: the identity card is the
 * "Basic Identification" group (person fields + status), the profile card is the
 * "Sports Profile" group, and results, Olympic status, awards and documents are
 * read-only lists that `profileGet` projects as arrays. Each group is one tab.
 */
export default model(
    () =>
        async function sportAthleteModel() {
            return {
                subject: 'sport',
                object: 'athlete',
                objectTitle: 'Athlete',
                public: true,
                nameField: 'athlete.personName',

                schema: {
                    properties: {
                        athlete: {
                            properties: {
                                personName: {title: 'Full Name', required: true, filter: true},
                                firstName: {title: 'First Name'},
                                middleName: {title: 'Middle Name'},
                                lastName: {title: 'Last Name', filter: true},
                                internationalName: {title: 'International Spelling'},
                                birthDate: {title: 'Date of Birth', widget: {type: 'date'}},
                                gender: {
                                    title: 'Gender',
                                    widget: {
                                        options: [
                                            {value: 'female', label: 'Female'},
                                            {value: 'male', label: 'Male'},
                                            {value: 'other', label: 'Other'},
                                        ],
                                    },
                                },
                                nationality: {title: 'Nationality'},
                                citizenship: {title: 'Citizenship'},
                                photoUrl: {title: 'Photograph URL'},
                                athleteStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'active', label: 'Active'},
                                            {value: 'retired', label: 'Retired'},
                                            {value: 'suspended', label: 'Suspended'},
                                        ],
                                    },
                                },
                                careerStartDate: {
                                    title: 'Career Start',
                                    widget: {type: 'date'},
                                },
                                careerEndDate: {title: 'Career End', widget: {type: 'date'}},
                                primarySportId: {
                                    title: 'Sport',
                                    widget: {dropdown: 'sport.sport'},
                                },
                                primaryDisciplineId: {
                                    title: 'Main Discipline',
                                    widget: {dropdown: 'sport.discipline'},
                                },
                                currentFederationId: {
                                    title: 'Federation',
                                    widget: {dropdown: 'sport.federation'},
                                },
                                currentClubId: {
                                    title: 'Club',
                                    widget: {dropdown: 'sport.club'},
                                },
                                athleteNote: {title: 'Notes', widget: {type: 'textArea'}},
                            },
                            widget: {
                                columns: [
                                    'personName',
                                    'birthDate',
                                    'athleteStatus',
                                    'primarySportId',
                                    'currentFederationId',
                                ],
                            },
                        },
                        /** Results — the athlete's competition participations. */
                        participations: {
                            title: 'Results',
                            items: {
                                properties: {
                                    editionId: {
                                        title: 'Edition',
                                        widget: {dropdown: 'sport.edition'},
                                    },
                                    participationFormat: {
                                        title: 'Format',
                                        widget: {
                                            options: [
                                                {value: 'individual', label: 'Individual'},
                                                {value: 'partners', label: 'With Partners'},
                                                {value: 'team', label: 'In a Team'},
                                            ],
                                        },
                                    },
                                    participationStatus: {
                                        title: 'Status',
                                        widget: {
                                            options: [
                                                {value: 'planned', label: 'Planned'},
                                                {value: 'confirmed', label: 'Confirmed'},
                                                {value: 'withdrawn', label: 'Withdrawn'},
                                            ],
                                        },
                                    },
                                    participationNote: {title: 'Notes'},
                                },
                            },
                            widget: {
                                type: 'table',
                                columns: [
                                    'editionId',
                                    'participationFormat',
                                    'participationStatus',
                                ],
                                actions: {allowAdd: false, allowEdit: false, allowDelete: false},
                            },
                        },
                        /** Olympic status — the athlete's cycle campaigns. */
                        campaigns: {
                            title: 'Olympic Status',
                            items: {
                                properties: {
                                    cycleId: {
                                        title: 'Cycle',
                                        widget: {dropdown: 'sport.cycle'},
                                    },
                                    olympicStatus: {
                                        title: 'Status',
                                        widget: {
                                            options: [
                                                {value: 'candidate', label: 'Candidate'},
                                                {value: 'qualified', label: 'Qualified'},
                                                {value: 'participant', label: 'Participant'},
                                            ],
                                        },
                                    },
                                    ratingOrganisationName: {title: 'Rating Body'},
                                    campaignNote: {title: 'Notes'},
                                },
                            },
                            widget: {
                                type: 'table',
                                columns: ['cycleId', 'olympicStatus', 'ratingOrganisationName'],
                                actions: {allowAdd: false, allowEdit: false, allowDelete: false},
                            },
                        },
                        /** Awards — the conferrals on this athlete. */
                        conferrals: {
                            title: 'Awards',
                            items: {
                                properties: {
                                    awardId: {
                                        title: 'Award',
                                        widget: {dropdown: 'sport.award'},
                                    },
                                    conferralDate: {title: 'Conferred On'},
                                    conferralStatus: {
                                        title: 'Status',
                                        widget: {
                                            options: [
                                                {value: 'nominated', label: 'Nominated'},
                                                {value: 'confirmed', label: 'Confirmed'},
                                                {value: 'cancelled', label: 'Cancelled'},
                                            ],
                                        },
                                    },
                                    basisNote: {title: 'Basis'},
                                },
                            },
                            widget: {
                                type: 'table',
                                columns: ['awardId', 'conferralDate', 'conferralStatus'],
                                actions: {allowAdd: false, allowEdit: false, allowDelete: false},
                            },
                        },
                        /** Documents — the attachments filed against this athlete. */
                        attachments: {
                            title: 'Documents',
                            items: {
                                properties: {
                                    documentId: {
                                        title: 'Document',
                                        widget: {dropdown: 'sport.document'},
                                    },
                                    attachmentRole: {
                                        title: 'Role',
                                        widget: {
                                            options: [
                                                {value: 'proof', label: 'Proof'},
                                                {value: 'photo', label: 'Photograph'},
                                                {value: 'decision', label: 'Decision'},
                                                {value: 'other', label: 'Other'},
                                            ],
                                        },
                                    },
                                    attachedDate: {title: 'Attached'},
                                    attachmentNote: {title: 'Notes'},
                                },
                            },
                            widget: {
                                type: 'table',
                                columns: ['documentId', 'attachmentRole', 'attachedDate'],
                                actions: {allowAdd: false, allowEdit: false, allowDelete: false},
                            },
                        },
                    },
                },

                cards: {
                    browse: {label: 'Athletes', widgets: ['athlete']},
                    identity: {
                        label: 'Basic Identification',
                        widgets: [
                            'athlete.personName',
                            'athlete.firstName',
                            'athlete.middleName',
                            'athlete.lastName',
                            'athlete.internationalName',
                            'athlete.birthDate',
                            'athlete.gender',
                            'athlete.nationality',
                            'athlete.citizenship',
                            'athlete.photoUrl',
                            'athlete.athleteStatus',
                        ],
                    },
                    profile: {
                        label: 'Sports Profile',
                        widgets: [
                            'athlete.primarySportId',
                            'athlete.primaryDisciplineId',
                            'athlete.currentFederationId',
                            'athlete.currentClubId',
                            'athlete.careerStartDate',
                            'athlete.careerEndDate',
                            'athlete.athleteNote',
                        ],
                    },
                    resultsCard: {
                        label: 'Results and Competitions',
                        className: 'col-12',
                        readOnly: true,
                        widgets: ['participations'],
                    },
                    olympicCard: {
                        label: 'Olympic Status',
                        className: 'col-12',
                        readOnly: true,
                        widgets: ['campaigns'],
                    },
                    awardsCard: {
                        label: 'Awards and Recognition',
                        className: 'col-12',
                        readOnly: true,
                        widgets: ['conferrals'],
                    },
                    documentsCard: {
                        label: 'Documents',
                        className: 'col-12',
                        readOnly: true,
                        widgets: ['attachments'],
                    },
                },

                layouts: {
                    // The athlete page is the layout reference: the six tabs are what
                    // `edit` resolves to, so create and open show the same page. The
                    // grid stays as the second variant. @@D-611
                    edit: {
                        orientation: 'left',
                        items: [
                            {
                                id: 'identity',
                                label: 'Identification',
                                icon: 'pi pi-id-card',
                                widgets: ['identity'],
                            },
                            {
                                id: 'profile',
                                label: 'Sports Profile',
                                icon: 'pi pi-user',
                                widgets: ['profile'],
                            },
                            {
                                id: 'results',
                                label: 'Results',
                                icon: 'pi pi-flag',
                                widgets: ['resultsCard'],
                            },
                            {
                                id: 'olympic',
                                label: 'Olympic Status',
                                icon: 'pi pi-star',
                                widgets: ['olympicCard'],
                            },
                            {
                                id: 'awards',
                                label: 'Awards',
                                icon: 'pi pi-trophy',
                                widgets: ['awardsCard'],
                            },
                            {
                                id: 'documents',
                                label: 'Documents',
                                icon: 'pi pi-file',
                                widgets: ['documentsCard'],
                            },
                        ],
                    },
                    editSplit: [['identity'], ['profile']],
                },

                browser: {
                    navigator: false,
                    title: 'Athletes',
                    icon: 'pi pi-user',
                    permission: {
                        browse: 'sport.athlete.find',
                        add: 'sport.athlete.add',
                        edit: 'sport.athlete.edit',
                        delete: 'sport.athlete.remove',
                    },
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.athlete.new',
                            permission: 'sport.athlete.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.athlete.open',
                            params: '${current}',
                        },
                        {
                            label: 'Report',
                            icon: 'pi pi-chart-bar',
                            action: 'component/sport.athlete.report',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected athlete?',
                            method: 'sport.athlete.remove',
                            params: {athleteId: '${athleteId}'},
                            // Without `refresh` the browse keeps the deleted row:
                            // the call succeeds and the table never refetches.
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
