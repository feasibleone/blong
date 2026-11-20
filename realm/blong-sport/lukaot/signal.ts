import {declare} from '@feasibleone/lukaot';

/**
 * What the `sport` realm reports while it seeds and answers.
 *
 * The realm has one piece of work of its own — reading the classifiers and the Bulgarian register out of
 * a seed file and resolving every reference by name — and the two lines below are its promises to an
 * operator: what the seed wrote, and which gender it derived for a sport whose events already state one.
 *
 * The gender line carries the **decision** the derivation took (`decide()` leaves the rationale for the next
 * record), which is the reason this signal exists rather than a bare `info`: a classification that
 * silently leaves a column empty is indistinguishable from one that was never meant to fill it.
 */
export default declare({
    log: {
        /** A seed run says how much it wrote, in the counts a person checking the seed adds up. */
        sportSeedMerged: {
            level: 'info',
            message:
                'seeded {sports} sport(s) and {disciplines} discipline(s) from the classification file',
            mtid: 'event',
            method: 'sport.nomenclature.merge',
        },
        /** One sport's gender was derived from its events, so the record can say which way and why. */
        sportSportGenderDerived: {
            level: 'debug',
            message: 'sport {sportName}: gender {sportGender}',
            mtid: 'event',
            method: 'sport.nomenclature.merge',
        },
    },
    decision: {
        /**
         * The gender a sport is drawn as, when the seed file does not state one.
         *
         * Derived only when every event of the sport is the same gender and none is open to both. The
         * four arms are the cases the classification file can produce, and the record that follows says
         * which one this sport was — the empty column is an answer, not a missing value (`@@D-932`).
         */
        sportGenderDerived: {
            message: 'which gender a sport is drawn as',
            branch: {
                absent: 'the file stated no events for it, so nothing could be derived',
                open: 'an event is open to both genders, which leaves the sport open',
                oneGender: 'every event of the sport is the same gender',
                mixed: 'the events are not one gender, so the sport is not either',
            },
        },
    },
});
