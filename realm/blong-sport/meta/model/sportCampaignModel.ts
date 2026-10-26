import {model} from '@feasibleone/blong';

/** `sportCampaignModel` — the athlete's row in one Olympic cycle. @@D-605 */
export default model(
    () =>
        async function sportCampaignModel() {
            return {
                subject: 'sport',
                object: 'campaign',
                objectTitle: 'Olympic Campaign',
                public: true,
                nameField: 'campaign.olympicStatus',
                schema: {
                    properties: {
                        campaign: {
                            properties: {
                                athleteId: {
                                    title: 'Athlete',
                                    required: true,
                                    widget: {dropdown: 'sport.athlete'},
                                },
                                cycleId: {
                                    title: 'Olympic Cycle',
                                    required: true,
                                    widget: {dropdown: 'sport.cycle'},
                                },
                                olympicStatus: {
                                    title: 'Olympic Status',
                                    required: true,
                                    widget: {
                                        options: [
                                            {value: 'candidate', label: 'Candidate'},
                                            {value: 'qualified', label: 'Qualified'},
                                            {value: 'participant', label: 'Participant'},
                                        ],
                                    },
                                },
                                programmeParticipation: {
                                    title: 'BOC Programme',
                                    widget: {type: 'boolean'},
                                },
                                olympicRanking: {
                                    title: 'Olympic Ranking',
                                    widget: {type: 'integer'},
                                },
                                olympicResult: {title: 'Olympic Result'},
                                ratingPosition: {
                                    title: 'Rating Position',
                                    widget: {type: 'integer'},
                                },
                                ratingOrganisationName: {title: 'Rating Organisation'},
                                ratingDate: {title: 'Rating Date', widget: {type: 'date'}},
                                campaignNote: {title: 'Notes', widget: {type: 'textArea'}},
                            },
                            widget: {
                                columns: [
                                    'athleteId',
                                    'cycleId',
                                    'olympicStatus',
                                    'olympicRanking',
                                    'ratingPosition',
                                ],
                            },
                        },
                    },
                },
                cards: {
                    browse: {label: 'Olympic Campaigns', widgets: ['campaign']},
                    status: {
                        label: 'Status',
                        widgets: [
                            'campaign.athleteId',
                            'campaign.cycleId',
                            'campaign.olympicStatus',
                            'campaign.programmeParticipation',
                            'campaign.olympicRanking',
                            'campaign.olympicResult',
                        ],
                    },
                    rating: {
                        label: 'Rating',
                        widgets: [
                            'campaign.ratingPosition',
                            'campaign.ratingOrganisationName',
                            'campaign.ratingDate',
                            'campaign.campaignNote',
                        ],
                    },
                },
                layouts: {
                    edit: [['status'], 'rating'],
                    editThumbIndex: {
                        orientation: 'left',
                        items: [
                            {
                                id: 'status',
                                label: 'Olympic Status',
                                icon: 'pi pi-trophy',
                                widgets: ['status'],
                            },
                            {
                                id: 'rating',
                                label: 'Rating',
                                icon: 'pi pi-chart-line',
                                widgets: ['rating'],
                            },
                        ],
                    },
                },
                browser: {
                    navigator: false,
                    title: 'Olympic Campaigns',
                    icon: 'pi pi-trophy',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/sport.campaign.new',
                            permission: 'sport.campaign.add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/sport.campaign.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete the selected campaign?',
                            method: 'sport.campaign.remove',
                            params: {campaignId: '${campaignId}'},
                            refresh: true,
                        },
                    ],
                },
            };
        },
);
