import {model} from '@feasibleone/blong';

/** `sportCoachModel` — person fields + the coaching activity group. @@D-595 */
export default model(
    () =>
        async function sportCoachModel() {
            return {
                subject: 'sport',
                object: 'coach',
                objectTitle: 'Coach',
                public: true,
                nameField: 'coach.personName',
                schema: {
                    properties: {
                        coach: {
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
                                coachStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'active', label: 'Active'},
                                            {value: 'inactive', label: 'Inactive'},
                                        ],
                                    },
                                },
                                careerStartDate: {title: 'Career Start', widget: {type: 'date'}},
                                primarySportId: {
                                    title: 'Sport',
                                    widget: {dropdown: 'sport.sport'},
                                },
                                currentFederationId: {
                                    title: 'Federation',
                                    widget: {dropdown: 'sport.federation'},
                                },
                                certificationNumber: {title: 'Certification No'},
                                certificationStatus: {
                                    title: 'Certification Status',
                                    widget: {
                                        options: [
                                            {value: 'active', label: 'Active'},
                                            {value: 'inactive', label: 'Inactive'},
                                            {value: 'terminated', label: 'Terminated'},
                                        ],
                                    },
                                },
                                certificationValidUntil: {
                                    title: 'Certification Valid Until',
                                    widget: {type: 'date'},
                                },
                                coachNote: {title: 'Notes', widget: {type: 'textArea'}},
                            },
                            widget: {
                                columns: [
                                    'personName',
                                    'certificationStatus',
                                    'primarySportId',
                                    'currentFederationId',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Coaches', widgets: ['coach']},
                    identity: {
                        label: 'Basic Identification',
                        widgets: [
                            'coach.personName',
                            'coach.firstName',
                            'coach.middleName',
                            'coach.lastName',
                            'coach.internationalName',
                            'coach.birthDate',
                            'coach.gender',
                            'coach.nationality',
                            'coach.citizenship',
                            'coach.photoUrl',
                            'coach.coachStatus',
                        ],
                    },
                    activity: {
                        label: 'Coaching Activity',
                        widgets: [
                            'coach.primarySportId',
                            'coach.currentFederationId',
                            'coach.careerStartDate',
                            'coach.certificationNumber',
                            'coach.certificationStatus',
                            'coach.certificationValidUntil',
                            'coach.coachNote',
                        ],
                    },
                },
                layouts: {
                    // `edit` is the tabbed layout, so create and open show the same
                    // page — the rule the athlete page set. @@D-611
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
                                id: 'activity',
                                label: 'Coaching Activity',
                                icon: 'pi pi-briefcase',
                                widgets: ['activity'],
                            },
                        ],
                    },
                    editSplit: [['identity'], 'activity'],
                },
                browser: {
                    title: 'Coaches',
                    icon: 'pi pi-briefcase',
                    permission: {
                        browse: 'sport.coach.find',
                        add: 'sport.coach.add',
                        edit: 'sport.coach.edit',
                        delete: 'sport.coach.remove',
                    },
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.coach.new',
                            permission: 'sport.coach.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.coach.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected coach?',
                            method: 'sport.coach.remove',
                            params: {coachId: '${coachId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
