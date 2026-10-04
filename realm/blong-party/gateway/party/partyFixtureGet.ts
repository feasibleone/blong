import {validation} from '@feasibleone/blong';

/**
 * `party.fixture.get` — the exposure of the test-only fixture read
 * (`adapter/dbTest/partyFixtureGet.ts`) as an RPC method.
 *
 * A handler of its own is not reachable through the gateway: the generic CRUD
 * methods are exposed because their table is declared in the realm's schema
 * (`meta/db/db.ts`), and anything else needs a validation — this file.  Without
 * it the matrix steps answer `Not Found` (404) rather than a verdict.
 *
 * The shapes are declared here rather than in the handler because a validation
 * is what the gateway publishes; the loose `additionalProperties` keeps a
 * fixture that grows a field from failing on the schema instead of on its table.
 */
export default validation(
    async ({lib: {type}}) =>
        function partyFixtureGet() {
            return {
                params: type.Object({
                    /** The records the fixture table mentions — facts are filtered to them. */
                    names: type.Array(type.String()),
                    /** Predicates to read (default: `belongsTo`, `isPartOf`, `hasRole`, `hasScope`, `hasCapability`). */
                    predicates: type.Optional(type.Array(type.String())),
                }),
                result: type.Object(
                    {
                        resources: type.Array(
                            type.Object(
                                {resourceName: type.String(), typeAlias: type.String()},
                                {additionalProperties: true},
                            ),
                        ),
                        facts: type.Array(
                            type.Object(
                                {
                                    subject: type.String(),
                                    subjectType: type.String(),
                                    predicate: type.String(),
                                    object: type.String(),
                                    objectType: type.String(),
                                },
                                {additionalProperties: true},
                            ),
                        ),
                        rules: type.Array(
                            type.Object(
                                {
                                    principal: type.String(),
                                    principalType: type.String(),
                                    action: type.String(),
                                    target: type.String(),
                                    targetKind: type.String(),
                                    effect: type.String(),
                                },
                                {additionalProperties: true},
                            ),
                        ),
                        clientIds: type.Array(
                            type.Object(
                                {
                                    resourceName: type.String(),
                                    clientId: type.Union([type.String(), type.Null()]),
                                },
                                {additionalProperties: true},
                            ),
                        ),
                    },
                    {additionalProperties: true},
                ),
            };
        },
);
