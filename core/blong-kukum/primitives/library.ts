import {
    capitalize,
    checkNames,
    type PrimitiveContext,
    type PrimitiveDescriptor,
    type PrimitiveFile,
    type PrimitiveHost,
} from '../engine.ts';
import {checkLayer} from './checks.ts';
import {groupOf, layerOf} from './shared.ts';

/** `library` — injected library functions the handler group shares. */

/**
 * Layers whose direct sub-folders are handler groups.
 *
 * A plain module in one of those folders is what the loader complains about, so
 * the audit looks exactly there. Custom layers can be named with `--layer`, but
 * the audit cannot know them, so it covers the well-known server ones.
 */
const HANDLER_LAYERS = [
    'orchestrator',
    'adapter',
    'gateway',
    'error',
    'test',
    'sim',
    'server/test',
];

/** The file-name contract `Watch` applies to a handler-group folder. */
const isGroupSource = (name: string): boolean =>
    /(?<!\.d)\.m?[tj]sx?$/i.test(name) &&
    !name.startsWith('.') &&
    !name.startsWith('~.') &&
    !/^layer\.(server|browser)\.[mc]?[tj]sx?$/i.test(name) &&
    !/^config\.[mc]?[tj]sx?$/i.test(name) &&
    // The group's own typed factory — a plain module the loader skips by name.
    !/^handlerGroup\.[mc]?[tj]sx?$/i.test(name) &&
    !/\.(test|play)\.[mc]?[tj]sx?$/i.test(name);

/** The factory a group keeps beside its handlers to type its `lib`. */
const HANDLER_GROUP_FILE = 'handlerGroup.ts';

/** True when a module default-exports something the loader can classify. */
const isDefaultExport = (source: string): boolean => /\bexport default\b/.test(source);

/** True when the default export is a `library()`. */
const isLibrary = (source: string): boolean => /\bexport default\s+library\s*\(/.test(source);

/** The name the library file/function takes: `--name`, else the triple object. */
const nameOf = (ctx: PrimitiveContext): string => String(ctx.params.name ?? ctx.object ?? '');

/** The member functions of a `bindings` bundle, from `--members=a,b`. */
function membersOf(ctx: PrimitiveContext, fallback: string): string[] {
    const raw = ctx.params.members;
    const list = (Array.isArray(raw) ? raw : String(raw ?? '').split(','))
        .map(member => member.trim())
        .filter(Boolean);
    return list.length ? list : [`${fallback}Helper`];
}

/** A handler-group file on disk, as the audit and `find` see it. */
interface GroupFile {
    /** The layer folder, e.g. `adapter` or `server/test`. */
    layer: string;
    /** The group folder inside the layer, e.g. `db`. */
    group: string;
    /** Root-relative path, for `find`. */
    path: string;
    source: string;
}

/** Every source file that sits in a handler group of the realm/suite at `root`. */
async function groupFiles(host: PrimitiveHost, root: string): Promise<GroupFile[]> {
    const found: GroupFile[] = [];
    for (const layer of HANDLER_LAYERS) {
        const layerDir = host.join(root, layer);
        if (!host.existsSync(layerDir)) continue;
        for (const entry of await host.scan(layerDir)) {
            if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
            const groupDir = host.join(layerDir, entry.name);
            for (const file of await host.scan(groupDir)) {
                if (!file.isFile() || !isGroupSource(file.name)) continue;
                const absolute = host.join(groupDir, file.name);
                found.push({
                    layer,
                    group: entry.name,
                    path: `${layer}/${entry.name}/${file.name}`,
                    source: String(host.readFileSync(absolute, {encoding: 'utf-8'})),
                });
            }
        }
    }
    return found;
}

/**
 * `library` — one or more injected library functions in one file.
 *
 * `function` is a single helper in its own file: the shape a group needs once or
 * twice. `bindings` puts a whole bundle of helpers that share a concern in ONE
 * file — the shape to reach for as soon as there are several, since one file per
 * helper stops being practical past two or three and each file is one more
 * `lib` merge with no reader benefit.
 */
const library: PrimitiveDescriptor = {
    id: 'library',
    title: 'Injected library function',
    skill: 'blong-handler',
    summary:
        'Functions shared inside one handler group. Kinds: function (one helper in one file) ' +
        'and bindings (a bundle of helpers sharing a concern, in one file).',
    kinds: ['function', 'bindings'],
    defaultKind: 'function',
    roots: [],
    check(ctx) {
        const name = nameOf(ctx);
        const problems = [
            ...checkNames(name, 'name'),
            ...checkLayer(ctx, ['orchestrator', 'adapter', 'gateway', 'error', 'test']),
        ];
        if (ctx.kind === 'bindings') {
            for (const member of membersOf(ctx, name)) {
                problems.push(...checkNames(member, 'member'));
            }
        }
        return problems;
    },
    /**
     * `files`, plus the one thing a new bundle needs beside it: the group's typed
     * factory. It is reported, never written — the bundle set it intersects is the
     * group's own knowledge.
     */
    compose({host, root, context}) {
        const files = this.files(context);
        const factory = `${layerOf(context, 'orchestrator')}/${groupOf(context)}/${HANDLER_GROUP_FILE}`;
        if (files.length && !host.existsSync(host.join(root, factory))) {
            files[0].notices = [
                ...(files[0].notices ?? []),
                `the group has no ${factory}: add one that exports ` +
                    '`handler = handlerGroup<…>()` over its library types, and its handlers ' +
                    'destructure `lib` with them',
            ];
        }
        return files;
    },
    /**
     * The library files an existing realm already holds.
     *
     * `find` cannot use `roots` here: a library lives one level deeper, in a
     * group folder whose name the descriptor cannot guess.
     */
    async discover(host, root) {
        return (await groupFiles(host, root))
            .filter(file => isLibrary(file.source))
            .map(file => file.path);
    },
    /**
     * The guardrail this primitive exists for: a plain module in a group folder
     * makes the loader log an error-level line on every run.
     */
    async audit({host, root}) {
        return (await groupFiles(host, root))
            .filter(file => !isDefaultExport(file.source))
            .map(
                file =>
                    `${file.path} is a plain module in the handler group ` +
                    `'${file.layer}/${file.group}': the loader logs an error for it on every ` +
                    'run. Make it an injected library function instead (kukum library add ' +
                    `--kind=bindings --layer=${file.layer} --group=${file.group} --name=NAME ` +
                    '--members=a,b), or move it out of the group folder.',
            );
    },
    files(ctx): PrimitiveFile[] {
        const name = nameOf(ctx);
        const Type = capitalize(name).replace(/Lib$/, '') + 'Lib';
        const layer = layerOf(ctx, 'orchestrator');
        const group = groupOf(ctx);
        const path = `${layer}/${group}/${name}.ts`;

        if (ctx.kind === 'bindings') {
            const members = membersOf(ctx, name);
            const declarations = members
                .map(
                    member => `function ${member}(input: unknown): unknown {
    return input;
}`,
                )
                .join('\n\n');
            const typeMembers = members
                .map(member => `    ${member}: typeof ${member};`)
                .join('\n');
            return [
                {
                    path,
                    content: `import {library} from '@feasibleone/blong';

/**
 * ${name} — helpers the ${group} handler group shares.
 *
 * One file holds every helper that belongs to this concern, because a file per
 * helper stops paying off for short functions. Handlers destructure the members
 * from \`lib\`, typed by the bundle type beside the factory: add the type to the
 * group's \`handlerGroup.ts\` (in this same folder), and every handler here is
 * typed.
 *
 *     export const handler = handlerGroup<${Type}>();   // once per group
 *     handler(({lib: {${members[0]}}}) => async function …)
 */
${declarations}

/** The bundle as a handler destructures it from \`lib\`. */
export type ${Type} = {
${typeMembers}
};

export default library((): ${Type} => ({${members.join(', ')}}));
`,
                },
            ];
        }

        return [
            {
                path,
                content: `import {library} from '@feasibleone/blong';

/**
 * ${name} — describe what this helper does.
 *
 * Shared with the ${group} group only: handlers destructure it from \`lib\`.
 * With one helper the group's \`handlerGroup.ts\` can intersect this module's
 * own shape; a second helper in the same concern belongs in ONE \`bindings\`
 * bundle (kukum library add --kind=bindings --name=${name} --members=a,b) instead
 * of a second file.
 */
export default library(
    () =>
        function ${name}(input: unknown): unknown {
            return input;
        },
);
`,
            },
        ];
    },
};

export default library;
