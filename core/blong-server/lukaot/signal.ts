import {declare} from '@feasibleone/lukaot';

/**
 * What the shared subject orchestrator reports while it assembles a realm's models (`@@D-896`).
 *
 * One name, because the case is one: a model whose derived handler name is not registered. It is a
 * warning rather than a failure — the following `subject.validation` answers the real symptom — but
 * it is the only line that says *why* the symptom appears, so it gets an identity an operator can
 * find with `blong-dev log --signal` and raise or silence on its own.
 *
 * The realm this file sits in is `srv` (`@@T-238`): a port of a realm it serves reads the whole
 * realm's vocabulary, whichever layer the declaration was written in (`@@T-718`).
 */
export default declare({
    log: {
        serverModelHandlerMismatch: {
            level: 'warn',
            message: "no model handler '{handler}' — expected '{handler}.ts'{registered}",
            mtid: 'event',
            method: 'subject.subjectModelList',
        },
    },
});
