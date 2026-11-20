/**
 * What the mock package reports, declared where the package is.
 *
 * A mock is a stand-in for a backend, and the reason its trace matters is diagnosis: a test failed
 * against a fixture that answered something nobody expected, and the record says which predicate was
 * answered with what. Ten debug lines did that before — one per predicate, each with its sentence
 * composed at the call site — and the cost was the one this vocabulary exists to remove: no identity
 * to count or silence, and a phrase to grep instead of a name.
 *
 * Two names, because the package reports two different kinds of moment: a call being **answered** (the
 * per-request trace) and the surface being **generated** (assembly time, once per subject). The
 * predicate a call answered travels as a parameter, which is what keeps one name enough for ten
 * predicates.
 *
 * Declared with `contribute` rather than `declare`, because this package owns no port: its handlers run
 * on whichever realm attached them, so its names are composed into that realm's vocabulary at the seam
 * the framework already has (`@@D-918`).
 */

import {contribute} from '@feasibleone/lukaot';

export const mockVocabulary = contribute({
    log: {
        /** A mock answered one call, with the request it was handed. */
        mockCallAnswered: {
            level: 'debug',
            message: 'mock answered {predicate}',
        },
        /** A subject's mock surface was generated from the fixture data. */
        mockSurfaceGenerated: {
            level: 'debug',
            message: 'generated the mock surface of {subject}',
        },
    },
});
