import {type IMeta, handler} from '@feasibleone/blong';

// The knex query builder is intentionally untyped here (matches the access realm's db handlers).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KnexQb = any;

/**
 * dbTest seed — the organizational hierarchy the record-level ACL test
 * (`test.acl.flow`) asserts against: an organization with a head office and two
 * branches, a second organization nobody has a scope on, and the persons placed
 * in those units.  The ACL grants themselves live in
 * `accessAuthorizationMerge.yaml`, which also creates the role they mention.
 *
 * Every entity is created through `core_resource.ensure` (idempotent — an
 * existing row is returned untouched), and the hierarchy is written as
 * `core.triple` edges in one batch with a single `access_pathRefresh()`, so the
 * materialized `access.effectiveRole` / `access.effectiveScope` paths are
 * current before the tests run.
 *
 * Wire: `party.hierarchy.merge` — dispatched from
 * `meta/dbTest/9-partyHierarchyMerge.yaml` (the numeric prefix orders it after
 * the plain party/access seeds, which it depends on).
 *
 * Lives in `adapter/dbTest/` because it is a TEST-ONLY seed: the db adapter
 * imports `.dbTest` handler groups only under `dev`, never in production.
 */
export default handler(
    ({
        handler: {
            'db/coreResourceEnsure': coreResourceEnsure,
            'db/coreTripleMerge': coreTripleMerge,
        },
    }) =>
        async function partyHierarchyMerge(
            params: {
                /** Organization names (short names — `legalName` is mirrored onto the resource). */
                organizations?: string[];
                units?: Array<{
                    name: string;
                    unitType?: string;
                    /** Owning organization name → `unit --belongsTo--> organization`. */
                    organization?: string;
                    /** Parent unit name → `unit --isPartOf--> parentUnit`. */
                    parentUnit?: string;
                }>;
                persons?: Array<{
                    /** Resource name (the display label). */
                    name: string;
                    firstName: string;
                    lastName: string;
                    /** Membership → `person --belongsTo--> unit`. */
                    unit?: string;
                }>;
            },
            $meta: IMeta,
        ): Promise<{success: boolean}> {
            const qb: KnexQb = this.config?.context?.queryBuilder;
            if (!qb) throw new Error('Database not available');

            const triples: Array<{
                subjectId: string;
                predicateName: string;
                objectId: string;
            }> = [];
            /** resource names are resolved per type so a name may repeat across types. */
            const ids = new Map<string, string>();
            const key = (typeAlias: string, name: string): string => `${typeAlias}:${name}`;

            /** Ensure a resource + entity row and remember its id for the edges. */
            const ensure = async (
                typeAlias: string,
                table: string,
                keyName: string,
                name: string,
                extraColumns: Record<string, unknown>,
            ): Promise<string> => {
                const {resourceId} = await coreResourceEnsure<{resourceId: string}>(
                    {name, typeAlias, table, extraColumns, keyName},
                    $meta,
                );
                ids.set(key(typeAlias, name), resourceId);
                return resourceId;
            };

            /** The id of an entity ensured earlier in this seed. */
            const idOf = (typeAlias: string, name: string): string => {
                const id = ids.get(key(typeAlias, name));
                if (!id) throw new Error(`ACL seed references an unknown ${typeAlias} "${name}"`);
                return id;
            };

            for (const name of params.organizations ?? []) {
                await ensure('party.organization', 'party_organization', 'organizationId', name, {
                    legalName: name,
                });
            }

            // Pass 1 — every unit, so a child may be declared before its parent.
            for (const unit of params.units ?? []) {
                await ensure('party.unit', 'party_unit', 'unitId', unit.name, {
                    unitName: unit.name,
                    unitType: unit.unitType ?? null,
                });
            }
            // Pass 2 — the unit hierarchy.
            for (const unit of params.units ?? []) {
                if (unit.organization) {
                    triples.push({
                        subjectId: idOf('party.unit', unit.name),
                        predicateName: 'belongsTo',
                        objectId: idOf('party.organization', unit.organization),
                    });
                }
                if (unit.parentUnit) {
                    triples.push({
                        subjectId: idOf('party.unit', unit.name),
                        predicateName: 'isPartOf',
                        objectId: idOf('party.unit', unit.parentUnit),
                    });
                }
            }

            for (const person of params.persons ?? []) {
                const personId = await ensure(
                    'party.person',
                    'party_person',
                    'personId',
                    person.name,
                    {firstName: person.firstName, lastName: person.lastName},
                );
                if (person.unit) {
                    triples.push({
                        subjectId: personId,
                        predicateName: 'belongsTo',
                        objectId: idOf('party.unit', person.unit),
                    });
                }
            }

            // One path refresh for the whole batch (deferred per merge).
            await coreTripleMerge({triples, refreshPath: true}, $meta);
            return {success: true};
        },
);
