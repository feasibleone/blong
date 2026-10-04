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
 * It also creates the **consent records** of the explicit-mode matrix
 * (`test.acl.matrix`), each owned by one of those persons.  They are seeded here
 * rather than in their own file because the rules that admit them name the
 * records by name, and `20-` runs before the authorization merge that resolves
 * those names.
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
export default handler(({handler: {}}) => ({
    async partyHierarchyMerge(
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
            consents?: Array<{
                /** Resource name (the display label). */
                name: string;
                consentType: string;
                /** Defaults to granted — the matrix reads, it never checks the flag. */
                isGranted?: boolean;
                /** Owner → `consent --belongsTo--> person`. */
                belongsTo?: string;
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

        /** The binary form of a resource id, for the edge cleanup below. */
        const bufferOf = (id: string): Buffer => Buffer.from(id.replace(/-/g, ''), 'hex');

        /** Ensure a resource + entity row and remember its id for the edges. */
        const ensure = async (
            typeAlias: string,
            table: string,
            keyName: string,
            name: string,
            extraColumns: Record<string, unknown>,
        ): Promise<string> => {
            const {resourceId} = (await super.coreResourceEnsure(
                {name, typeAlias, table, extraColumns, keyName},
                $meta,
            )) as {resourceId: string};
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
            const personId = await ensure('party.person', 'party_person', 'personId', person.name, {
                firstName: person.firstName,
                lastName: person.lastName,
            });
            if (person.unit) {
                triples.push({
                    subjectId: personId,
                    predicateName: 'belongsTo',
                    objectId: idOf('party.unit', person.unit),
                });
            }
        }

        // Consents last: their `belongsTo` edge names a person ensured above.
        for (const consent of params.consents ?? []) {
            const consentId = await ensure(
                'party.consent',
                'party_consent',
                'consentId',
                consent.name,
                {
                    consentName: consent.name,
                    consentType: consent.consentType,
                    isGranted: consent.isGranted ?? true,
                },
            );
            if (consent.belongsTo) {
                triples.push({
                    subjectId: consentId,
                    predicateName: 'belongsTo',
                    objectId: idOf('party.person', consent.belongsTo),
                });
            }
        }

        // The seed is AUTHORITATIVE for the entities it names.  The triple merge
        // inserts with `onConflict` ignore, so an edge this fixture no longer
        // declares would survive — a person moved to another unit would keep
        // belonging to the old one and its scope set would never narrow again.
        const subjectIds = [...ids.values()].map(bufferOf);
        if (subjectIds.length) {
            await qb('core_triple')
                .whereIn('subjectId', subjectIds)
                .whereIn('predicateName', ['belongsTo', 'isPartOf'])
                .del();
        }

        // One path refresh for the whole batch (deferred per merge).
        await super.coreTripleMerge({triples, refreshPath: true}, $meta);
        return {success: true};
    },
}));
