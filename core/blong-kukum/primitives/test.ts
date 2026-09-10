import {
    capitalize,
    checkObject,
    checkSubject,
    type PrimitiveContext,
    type PrimitiveDescriptor,
    type PrimitiveFile,
} from '../engine.ts';
import {appendDescribeBlock, appendStringEntry} from '../merge.ts';
import {readGenerated} from './compose.ts';
import {seedRowName} from './shared.ts';

/** `test` — server tap groups, browser tap groups and Playwright specs. */

/**
 * A server-side tap group that drives the generated `${subject}.${object}` API:
 * add, then find. Asserting the round-trip (rather than `assert.ok(true)`) is
 * what makes "the entity is covered by its tests" a real claim.
 */
function testServerSource(ctx: PrimitiveContext): string {
    const {subject, object} = ctx;
    const Entity = capitalize(object);
    const method = `test${Entity}`;
    return `import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * ${method} — server-side ${subject}.${object} flow test.
 *
 * Adds a ${object} through the generated handler and finds it again, so the
 * generated API surface is exercised rather than only compile-checked.
 * Registered as the 'test.${object}' group in index.ts (integration.watch.test).
 */
export default handler(
    ({lib: {group}, handler: {${subject}${Entity}Add, ${subject}${Entity}Find}}) => ({
        ${method}: ({name = '${subject} flow'}: {name?: string} = {}) =>
            group(name)([
                async function add${Entity}(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const ${object}Name = 'ENT-TEST-' + Date.now();
                    const result = await ${subject}${Entity}Add<{
                        ${object}: {${object}Id: number; ${object}Name: string};
                    }>(
                        {
                            ${object}: {
                                ${object}Name,
                                ${object}Status: 'draft',
                            },
                        },
                        $meta,
                    );
                    assert.ok(result.${object}.${object}Id, '${object} add succeeds');
                    return {...result.${object}, ${object}Name};
                },

                async function find${Entity}(
                    assert: IAssert,
                    {
                        $meta,
                        add${Entity}: created,
                    }: {
                        $meta: IMeta;
                        add${Entity}: Awaited<{${object}Id: number; ${object}Name: string}>;
                    },
                ) {
                    const ${object} = await created;
                    // Filter by the row this run created instead of paging the
                    // whole table: the table keeps growing between runs, so page
                    // 1 of an unfiltered find stops containing the new row once
                    // there are more rows than pageSize.
                    const result = await ${subject}${Entity}Find<
                        Array<{${object}Id: number; ${object}Name: string}>
                    >(
                        {
                            paging: {pageNumber: 1, pageSize: 10},
                            filterBy: {${object}Name: ${object}.${object}Name},
                        },
                        $meta,
                    );
                    assert.ok(
                        result.some(item => item.${object}Id === ${object}.${object}Id),
                        '${object} find returns the added ${object}',
                    );
                    return result;
                },
            ]),
    }),
);
`;
}

/**
 * A browser-side tap group. It reaches the generated API over HTTP through the
 * blong-test backend adapter, so the gateway and its authorization path are
 * exercised too — the browser platform's reason to exist.
 */
function testBrowserSource(ctx: PrimitiveContext): string {
    const {subject, object} = ctx;
    const Entity = capitalize(object);
    const method = `test${Entity}Flow`;
    return `import {type IAssert, type IMeta, handler} from '@feasibleone/blong';

/**
 * ${method} — browser-side ${subject}.${object} flow test.
 *
 * Logs in through blong-access, then adds and finds a ${object} over HTTP.
 * Registered as the 'test.${object}.flow' group in browser-test.ts.
 */
export default handler(
    ({
        lib: {group},
        handler: {loginTokenCreate, ${subject}${Entity}Add, ${subject}${Entity}Find},
    }) => ({
        ${method}: ({name = '${subject} flow browser'}: {name?: string} = {}) =>
            group(name)([
                async function login(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const result = await loginTokenCreate<{access_token: string}>(
                        {username: 'testAdmin', password: 'testPassword'},
                        $meta,
                    );
                    assert.ok(result.access_token, 'login returns an access token');
                    return result;
                },

                async function add${Entity}(assert: IAssert, {$meta}: {$meta: IMeta}) {
                    const ${object}Name = 'ENT-BROWSER-' + Date.now();
                    const result = await ${subject}${Entity}Add<{
                        ${object}: {${object}Id: number; ${object}Name: string};
                    }>(
                        {
                            ${object}: {
                                ${object}Name,
                                ${object}Status: 'draft',
                            },
                        },
                        $meta,
                    );
                    assert.ok(result.${object}.${object}Id, '${object} add over HTTP succeeds');
                    return {...result.${object}, ${object}Name};
                },

                async function find${Entity}(
                    assert: IAssert,
                    {
                        $meta,
                        add${Entity}: created,
                    }: {
                        $meta: IMeta;
                        add${Entity}: Awaited<{${object}Id: number; ${object}Name: string}>;
                    },
                ) {
                    const ${object} = await created;
                    // Filter by the row this run created instead of paging the
                    // whole table: the table keeps growing between runs, so page
                    // 1 of an unfiltered find stops containing the new row once
                    // there are more rows than pageSize.
                    const result = await ${subject}${Entity}Find<
                        Array<{${object}Id: number; ${object}Name: string}>
                    >(
                        {
                            paging: {pageNumber: 1, pageSize: 10},
                            filterBy: {${object}Name: ${object}.${object}Name},
                        },
                        $meta,
                    );
                    assert.ok(
                        result.some(item => item.${object}Id === ${object}.${object}Id),
                        '${object} find over HTTP returns the added ${object}',
                    );
                    return result;
                },
            ]),
    }),
);
`;
}

/** The spec's imports and shared setup — emitted once, at the top of the file. */
function testPlaywrightHeader(subject: string): string {
    return `import {expect, test} from '@feasibleone/blong-browser/playwright';
import {
    browseModel,
    cleanupModel,
    createAndEditModel,
} from '@feasibleone/blong-browser/playwright/model';

test.use({blongPermissions: true});

/**
 * ${subject}.play.ts — full-stack CRUD for the ${subject} entities.
 *
 * Each entity contributes one test.describe block; adding another appends to
 * this file rather than replacing the blocks already here.
 *
 * Baselines are committed under test/${subject}.play.ts-snapshots/. Refresh them
 * deliberately with \`npm run playwright:update\` after an intentional UI change.
 */
`;
}

/**
 * One entity's block.
 *
 * This is the only part appended when a second entity is added — appending the
 * whole generated file would duplicate the imports and fail to compile.
 */
function testPlaywrightBlock(ctx: PrimitiveContext): string {
    const {subject, object} = ctx;
    const Entity = capitalize(object);
    return `test.describe('${Entity}', () => {
    // Declared first so leftover test rows are deleted before the baselines.
    cleanupModel(test, expect, {
        subject: '${subject}',
        object: '${object}',
        search: 'ENT-PLAY',
        removeMethod: '${subject}.${object}.remove',
    });

    browseModel(test, expect, {
        subject: '${subject}',
        object: '${object}',
        // Filtered to the seeded row. Without a search the baseline captures
        // whatever the tap suites created (ENT-TEST-<timestamp>) and fails on
        // every run.
        searchText: '${seedRowName(object)}',
    });

    createAndEditModel(test, expect, {
        subject: '${subject}',
        object: '${object}',
        fields: {
            '${object}.${object}Name': 'ENT-PLAY-001',
            '${object}.${object}Status': 'Sent',
        },
        editFields: {'${object}.${object}Name': 'ENT-PLAY-001 Edited'},
        search: 'ENT-PLAY-001',
    });
});
`;
}

/** The files a `test` kind produces. */
function testFiles(ctx: PrimitiveContext): PrimitiveFile[] {
    const method = `test${capitalize(ctx.object)}`;
    switch (ctx.kind) {
        case 'browser':
            return [
                {
                    path: `browser/test/test/${method}.flow.ts`,
                    content: testBrowserSource(ctx),
                },
            ];
        case 'playwright':
            return [
                {
                    path: `test/${ctx.subject}.play.ts`,
                    content: `${testPlaywrightHeader(ctx.subject)}\n${testPlaywrightBlock(ctx)}`,
                },
            ];
        default:
            return [{path: `server/test/test/${method}.ts`, content: testServerSource(ctx)}];
    }
}

/** The bootstrap file whose `integration.watch.test` list owns a test kind. */
const testConfigPath = (kind: string): string =>
    kind === 'browser' ? 'browser-test.ts' : 'index.ts';

/** The entry a test kind must appear as in `integration.watch.test`. */
const testGroupEntry = (ctx: PrimitiveContext): string =>
    ctx.kind === 'browser' ? `test.${ctx.object}.flow` : `test.${ctx.object}`;

const test: PrimitiveDescriptor = {
    id: 'test',
    title: 'Tests',
    skill: 'blong-test',
    summary:
        'Server tap groups, browser tap groups and Playwright specs. Each generated test drives ' +
        "the entity's CRUD, and the group is registered in the owning platform's " +
        'integration.watch.test list so it actually executes.',
    kinds: ['server', 'browser', 'playwright'],
    defaultKind: 'server',
    roots: ['server/test/test', 'browser/test/test', 'test'],
    check(ctx) {
        return [...checkSubject(ctx.subject), ...checkObject(ctx.object)];
    },
    files(ctx) {
        return testFiles(ctx);
    },
    compose({host, root, context}) {
        const [group] = testFiles(context);
        if (context.kind === 'playwright') {
            const existing = readGenerated(host, root, group.path);
            if (!existing) return [group];
            return [
                {
                    ...group,
                    content: appendDescribeBlock(
                        existing,
                        capitalize(context.object),
                        testPlaywrightBlock(context),
                    ),
                },
            ];
        }
        // A generated group that nobody lists in `integration.watch.test` is
        // silently never executed, so registering it is part of generating it.
        const path = testConfigPath(context.kind);
        const entry = testGroupEntry(context);
        const existing = readGenerated(host, root, path);
        if (!existing) {
            return [
                {
                    ...group,
                    notices: [
                        `could not register the '${entry}' test group: ${path} is missing or ` +
                            'hand-written. Add the entry to its integration.watch.test list, ' +
                            'or the group will never run.',
                    ],
                },
            ];
        }
        const merged = appendStringEntry(existing, 'test', entry);
        if (merged === undefined) {
            return [
                {
                    ...group,
                    notices: [
                        `could not find an integration.watch.test array in ${path}; add ` +
                            `'${entry}' by hand or the group will never run.`,
                    ],
                },
            ];
        }
        return [group, {path, content: merged}];
    },
};

export default test;
