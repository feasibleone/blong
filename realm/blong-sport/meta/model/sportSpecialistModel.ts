import {model} from '@feasibleone/blong';

/** `sportSpecialistModel` — person fields + the qualification group. @@D-595 */
export default model(
    () =>
        async function sportSpecialistModel() {
            return {
                subject: 'sport',
                object: 'specialist',
                objectTitle: 'Sports Specialist',
                public: true,
                nameField: 'specialist.personName',
                schema: {
                    properties: {
                        specialist: {
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
                                specialistStatus: {
                                    title: 'Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'active', label: 'Active'},
                                            {value: 'inactive', label: 'Inactive'},
                                        ],
                                    },
                                },
                                expertAreaId: {
                                    title: 'Expert Area',
                                    required: true,
                                    widget: {dropdown: 'sport.area'},
                                },
                                specialtyName: {title: 'Specialty'},
                                qualificationLevel: {title: 'Qualification Level'},
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
                                careerStartDate: {title: 'Career Start', widget: {type: 'date'}},
                                specialistNote: {title: 'Notes', widget: {type: 'textArea'}},
                            },
                            widget: {
                                columns: ['personName', 'expertAreaId', 'certificationStatus'],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Specialists', widgets: ['specialist']},
                    identity: {
                        label: 'Basic Identification',
                        widgets: [
                            'specialist.personName',
                            'specialist.firstName',
                            'specialist.middleName',
                            'specialist.lastName',
                            'specialist.internationalName',
                            'specialist.birthDate',
                            'specialist.gender',
                            'specialist.nationality',
                            'specialist.citizenship',
                            'specialist.photoUrl',
                            'specialist.specialistStatus',
                        ],
                    },
                    qualification: {
                        label: 'Qualification and Expertise',
                        widgets: [
                            'specialist.expertAreaId',
                            'specialist.specialtyName',
                            'specialist.qualificationLevel',
                            'specialist.careerStartDate',
                            'specialist.certificationNumber',
                            'specialist.certificationStatus',
                            'specialist.certificationValidUntil',
                            'specialist.specialistNote',
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
                                id: 'qualification',
                                label: 'Qualification',
                                icon: 'pi pi-verified',
                                widgets: ['qualification'],
                            },
                        ],
                    },
                    editSplit: [['identity'], 'qualification'],
                },
                browser: {
                    navigator: false,
                    title: 'Sports Specialists',
                    icon: 'pi pi-heart',
                    permission: {
                        browse: 'sport.specialist.find',
                        add: 'sport.specialist.add',
                        edit: 'sport.specialist.edit',
                        delete: 'sport.specialist.remove',
                    },
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.specialist.new',
                            permission: 'sport.specialist.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.specialist.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected specialist?',
                            method: 'sport.specialist.remove',
                            params: {specialistId: '${specialistId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
