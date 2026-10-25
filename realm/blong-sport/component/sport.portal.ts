import {handler} from '@feasibleone/blong';

/**
 * `sport.portal.params` — the portal menu.
 *
 * Groups follow the model.md chapters: the people the register is about, the
 * organisations they belong to, and the classifiers everything points at. Each
 * item names the model's browse method, which the portal resolves the same way
 * the generated Browse page does.
 */
export default handler(() => ({
    async 'sport.portal.params'() {
        return {
            menu: [
                {
                    title: 'People',
                    items: [
                        {title: 'Athletes', method: 'sport.athlete.browse', icon: 'pi pi-user'},
                        {title: 'Coaches', method: 'sport.coach.browse', icon: 'pi pi-briefcase'},
                        {
                            title: 'Specialists',
                            method: 'sport.specialist.browse',
                            icon: 'pi pi-heart',
                        },
                    ],
                },
                {
                    title: 'Organisations',
                    items: [
                        {
                            title: 'Federations',
                            method: 'sport.federation.browse',
                            icon: 'pi pi-building',
                        },
                        {title: 'Clubs', method: 'sport.club.browse', icon: 'pi pi-home'},
                    ],
                },
                {
                    title: 'Competition',
                    items: [
                        {
                            title: 'Competitions',
                            method: 'sport.competition.browse',
                            icon: 'pi pi-trophy',
                        },
                        {title: 'Editions', method: 'sport.edition.browse', icon: 'pi pi-calendar'},
                        {
                            title: 'Participations',
                            method: 'sport.participation.browse',
                            icon: 'pi pi-flag',
                        },
                        {title: 'Results', method: 'sport.result.browse', icon: 'pi pi-chart-bar'},
                    ],
                },
                {
                    title: 'Olympic and Awards',
                    items: [
                        {title: 'Campaigns', method: 'sport.campaign.browse', icon: 'pi pi-star'},
                        {
                            title: 'Qualifications',
                            method: 'sport.qualification.browse',
                            icon: 'pi pi-check-circle',
                        },
                        {title: 'Awards', method: 'sport.award.browse', icon: 'pi pi-trophy'},
                        {
                            title: 'Conferrals',
                            method: 'sport.conferral.browse',
                            icon: 'pi pi-star-fill',
                        },
                    ],
                },
                {
                    title: 'Relationships',
                    items: [
                        {
                            title: 'Coaching Periods',
                            method: 'sport.coaching.browse',
                            icon: 'pi pi-user-plus',
                        },
                        {
                            title: 'Support Periods',
                            method: 'sport.support.browse',
                            icon: 'pi pi-heart',
                        },
                        {
                            title: 'Affiliations',
                            method: 'sport.affiliation.browse',
                            icon: 'pi pi-link',
                        },
                    ],
                },
                {
                    title: 'Documents',
                    items: [
                        {title: 'Documents', method: 'sport.document.browse', icon: 'pi pi-file'},
                        {
                            title: 'Attachments',
                            method: 'sport.attachment.browse',
                            icon: 'pi pi-paperclip',
                        },
                    ],
                },
                {
                    title: 'Reference',
                    items: [
                        {title: 'Sports', method: 'sport.sport.browse', icon: 'pi pi-flag'},
                        {
                            title: 'Disciplines',
                            method: 'sport.discipline.browse',
                            icon: 'pi pi-sitemap',
                        },
                        {title: 'Categories', method: 'sport.category.browse', icon: 'pi pi-tags'},
                        {
                            title: 'Olympic Cycles',
                            method: 'sport.cycle.browse',
                            icon: 'pi pi-calendar',
                        },
                        {title: 'Expert Areas', method: 'sport.area.browse', icon: 'pi pi-heart'},
                    ],
                },
            ],
        };
    },
}));
