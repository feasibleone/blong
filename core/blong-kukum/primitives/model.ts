import {capitalize, checkObject, checkSubject, type PrimitiveDescriptor} from '../engine.ts';

/** `model` — the IModelSpec that drives the generated CRUD pages. */

const model: PrimitiveDescriptor = {
    id: 'model',
    title: 'Model spec / fixture',
    skill: 'blong-model',
    summary:
        'IModelSpec driving Browse/New/Open/Report pages (meta/model) and mock fixtures (meta/fixture).',
    kinds: ['model', 'fixture'],
    defaultKind: 'model',
    roots: ['meta/model', 'meta/fixture'],
    check(ctx) {
        return [...checkSubject(ctx.subject), ...checkObject(ctx.object)];
    },
    files(ctx) {
        const Entity = capitalize(ctx.object);
        /**
         * Matches the `blong-kopi` template naming (`$subject$ObjectModel.ts`), so
         * regenerating a model replaces the scaffolded one instead of leaving two
         * models claiming the same entity.
         */
        const Name = `${ctx.subject}${Entity}`;
        /**
         * The model system resolves `${...}` placeholders in toolbar params.
         * They are assembled here rather than written literally so the
generated
         * spec keeps them verbatim without template-literal escaping.
         */
        const current = '$' + '{current}';
        const idPlaceholder = '$' + '{' + ctx.object + 'Id}';
        if (ctx.kind === 'fixture') {
            return [
                {
                    path: `meta/fixture/${ctx.subject}Fixture.ts`,
                    content: `import {fixture} from '@feasibleone/blong';

export default fixture(() => async function ${ctx.subject}Fixture() {
    return {
        '${ctx.subject}.${ctx.object}': [{${ctx.object}Id: '1', ${ctx.object}Name: 'Example'}],
    };
});
`,
                },
            ];
        }
        return [
            {
                path: `meta/model/${Name}Model.ts`,
                content: `import {model} from '@feasibleone/blong';

/**
 * meta/model/${Name}Model.ts — model spec for the \`${ctx.object}\` entity.
 *
 * Drives the auto-generated Browse/New/Open pages. \`public: true\` exposes the
 * standard CRUD operations on the gateway, validated by blong-server's
 * subject.validation — no manual gateway override is needed.
 *
 * The field names here must match meta/type/${ctx.subject}.ts: the Playwright
 * helpers drive this page by name, so a rename has to happen in both places.
 */
export default model(
    () =>
        async function ${Name}Model() {
            return {
                subject: '${ctx.subject}',
                object: '${ctx.object}',
                objectTitle: '${Entity}',
                public: true,
                nameField: '${ctx.object}.${ctx.object}Name',
                schema: {
                    properties: {
                        ${ctx.object}: {
                            properties: {
                                ${ctx.object}Name: {title: 'Name', filter: true, sort: true},
                                ${ctx.object}Status: {
                                    title: 'Status',
                                    widget: {
                                        options: [
                                            {value: 'draft', label: 'Draft'},
                                            {value: 'sent', label: 'Sent'},
                                            {value: 'paid', label: 'Paid'},
                                            {value: 'void', label: 'Void'},
                                        ],
                                    },
                                },
                            },
                            widget: {columns: ['${ctx.object}Name', '${ctx.object}Status']},
                        },
                    },
                },
                cards: {
                    browse: {label: '${Entity}s', widgets: ['${ctx.object}']},
                    edit: {
                        label: '${Entity} Details',
                        className: 'col-12 md:col-8',
                        widgets: ['${ctx.object}.${ctx.object}Name', '${ctx.object}.${ctx.object}Status'],
                    },
                },
                browser: {
                    title: '${Entity}s',
                    icon: 'pi pi-file',
                    toolbar: [
                        {
                            label: 'Create',
                            icon: 'pi pi-plus',
                            action: 'component/${ctx.subject}.${ctx.object}.new',
                            permission: '${ctx.subject}${Entity}Add',
                        },
                        {
                            label: 'Edit',
                            icon: 'pi pi-pencil',
                            enabled: 'current',
                            method: 'component/${ctx.subject}.${ctx.object}.open',
                            params: '${current}',
                        },
                        {
                            label: 'Delete',
                            icon: 'pi pi-trash',
                            enabled: 'selected',
                            confirm: 'Delete selected ${ctx.object}?',
                            method: '${ctx.subject}.${ctx.object}.remove',
                            refresh: true,
                            params: {${ctx.object}Id: '${idPlaceholder}'},
                        },
                    ],
                },
            };
        },
);
`,
            },
        ];
    },
};

export default model;
