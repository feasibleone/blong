import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * The realm's own flow test: does `blong.*` reach the cluster service, and does
 * the service's answer travel back unchanged?
 *
 * These steps call the methods through the handler proxy, in this process, so
 * what they exercise is the realm's wiring — the subject namespace, the
 * `semlog` port, the URL and the one helper that builds the request. The
 * service is running beside them, because the framework starts it in the `dev`
 * intent (`log.cluster`), which is exactly the arrangement a development run
 * has: nothing here starts a server or opens a file, and the records the test
 * run itself produces are what the service is reading.
 *
 * The refusals matter as much as the answers: a flow execution the service never
 * retained must come back as a refusal rather than as an empty diagram, or the
 * page that asked for it would draw nothing and look like a service with no
 * data.
 */
export default handler(
    ({
        lib: {group},
        handler: {
            blongFlowFind,
            blongFlowGet,
            blongTemplateFind,
            blongSearchFind,
            blongDigestGet,
            blongIncidentFind,
        },
    }) => ({
        testBlongRealmFlow: ({name = 'blong realm flow'}: {name?: string} = {}) =>
            group(name)([
                /** The service's view of what has been observed (R22/R23). */
                async function findFlows(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const flows = await blongFlowFind<{
                        unions: unknown[];
                        executions: unknown[];
                    }>({}, $meta);
                    assert.ok(Array.isArray(flows?.unions), 'the unions of every observed kind');
                    assert.ok(
                        Array.isArray(flows?.executions),
                        'and the executions to draw one of',
                    );
                    return flows;
                },

                /** The unit the service stores: messages with their variables removed (R4). */
                async function findTemplates(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const templates = await blongTemplateFind<unknown[]>({}, $meta);
                    assert.ok(
                        Array.isArray(templates),
                        'the templates the run has taught the service',
                    );
                },

                /** The correlated failures, one per trace and burst (R15). */
                async function findIncidents(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const incidents = await blongIncidentFind<unknown[]>({}, $meta);
                    assert.ok(
                        Array.isArray(incidents),
                        'the incidents a healthy run has not raised',
                    );
                },

                /** The change stream since a point in time (R8). */
                async function getDigest(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const digest = await blongDigestGet<unknown>({limit: 10}, $meta);
                    // Shape-light on purpose: the digest is the service's own stream
                    // and what it contains depends on what the run has done. What is
                    // asserted is that the realm asked and the service answered
                    // rather than the realm inventing an answer.
                    assert.ok(digest !== undefined && digest !== null, 'the stream answers');
                },

                /** A query is answered by the service, which is the only thing that can rank one (R14). */
                async function searchTemplates(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const found = await blongSearchFind<unknown>(
                        {query: 'blong realm flow'},
                        $meta,
                    );
                    assert.ok(found !== undefined && found !== null, 'the search answers');
                },

                /** A refusal is passed through, never flattened into an empty answer. */
                async function getUnknownFlow(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    // A ULID-shaped reference the service has never seen, composed
                    // rather than written out: an id that is spelled out is an id a
                    // spell checker has to be taught, and there is nothing to learn
                    // from these characters.
                    const unknownFlow = '0'.repeat(26);
                    await assert.rejects(
                        () => Promise.resolve(blongFlowGet({reference: unknownFlow}, $meta)),
                        // The service's own status, not just "something failed": a
                        // rejection from anywhere would pass an assertion that only
                        // asked for a rejection, and a routing mistake would look
                        // exactly like a refusal.
                        /answered 404/,
                        'an execution the service never retained is refused rather than drawn empty',
                    );
                },
            ]),
    }),
);
