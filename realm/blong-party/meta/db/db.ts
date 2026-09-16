import {handler} from '@feasibleone/blong';

export default handler(() => ({
    config: {
        schema: {
            dbTest: true,
            tables: {
                // Party tables are resource-backed with a REAL display-name column
                // (`resource: {nameColumn}`), not the virtual `${object}Name`:
                // `core_resource.resourceName` mirrors that column — which is what
                // dropdown labels and ACL target names read — while the column
                // itself stays a normal, editable table column.
                //
                // The hierarchy lives in `core_triple` and is declared here as
                // `edges`, so the models can manage it as pivot arrays and the
                // generic CRUD keeps it in sync (`core.path` refresh included).
                'party.person': {
                    order: 300,
                    resource: {nameColumn: 'lastName'},
                    edges: [
                        {
                            // Membership: person → unit.
                            predicate: 'belongsTo',
                            table: 'party_unit',
                            object: 'unit',
                            objectKey: 'unitId',
                            nameField: 'unitName',
                        },
                    ],
                    // Record-level ACL: a person is acted on within the unit it
                    // belongs to.  `add` reads the unit from the submitted
                    // `belongsTo` edge (a person has no unit column).
                    acl: {
                        mode: 'scoped',
                        scopes: ['belongsTo'],
                        addScope: {predicate: 'belongsTo'},
                    },
                },
                'party.organization': {
                    order: 301,
                    resource: {nameColumn: 'legalName'},
                    // An organization is scoped at *itself*: the hierarchy points
                    // the other way (`unit --belongsTo--> organization`), so the
                    // record has no scope edge to follow and a grant naming the
                    // organization (or a parent organization) is what admits it.
                    acl: {mode: 'scoped', selfScope: true},
                },
                'party.unit': {
                    order: 302,
                    resource: {nameColumn: 'unitName'},
                    edges: [
                        {
                            // The unit's owning organization.
                            predicate: 'belongsTo',
                            table: 'party_organization',
                            object: 'organization',
                            objectKey: 'organizationId',
                            nameField: 'organizationName',
                        },
                        {
                            // Self-referencing tree: child unit → parent unit.  The
                            // materialized `access.effectiveScope` path turns this
                            // into "a grant on a parent covers its descendants".
                            predicate: 'isPartOf',
                            table: 'party_unit',
                            object: 'parentUnit',
                            objectKey: 'unitId',
                            nameField: 'unitName',
                            reverse: true,
                        },
                    ],
                    acl: {
                        mode: 'scoped',
                        scopes: ['belongsTo'],
                        addScope: {predicate: 'belongsTo'},
                    },
                },
                'party.contact': 303,
                'party.address': 304,
                'party.identifier': 305,
            },
        },
        // No mock entries — all models use real DB tables (like marineCoralModel).
    },
}));
