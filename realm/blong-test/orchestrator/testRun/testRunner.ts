import {handler} from '@feasibleone/blong';

type StepArray = unknown[] & {name?: string};
type Meta = Record<string, unknown>;

const controllerSpecifier = new URL('../../server/testRunController.ts', import.meta.url).href;
const controller = async () =>
    (await import(controllerSpecifier)).testRunController as {
        start: (run: {
            method: string;
            name: string;
            steps: StepArray;
            $meta: Meta;
        }) => Promise<unknown>;
        events: (runId: string, cursor: number) => unknown;
        snapshot: (runId: string) => unknown;
        cancel: (runId: string) => void;
    };

/** The server groups an access-hosted console may start when nothing is configured. */
const defaultServerGroups = ['test.session.flow', 'test.login.flow'];

/**
 * The configured group allowlist.
 *
 * A suite nests it under its `testRealm` block (`testRealm: {testRun: {serverGroups: [...]}}`),
 * which is the config a handler in this realm reads; the flat form is accepted too so a
 * host that configures the runner directly works.
 */
const serverGroupList = (config: unknown): string[] => {
    const value = config as
        | {serverGroups?: string[]; testRun?: {serverGroups?: string[]}}
        | undefined;
    return value?.testRun?.serverGroups ?? value?.serverGroups ?? defaultServerGroups;
};

const methodName = (method: string): string =>
    method
        .split('.')
        .filter(Boolean)
        .map((part, index) => (index === 0 ? part : part[0].toUpperCase() + part.slice(1)))
        .join('');

export default handler(function testRunner({handler: proxy, config}) {
    const serverGroups = new Set<string>(serverGroupList(config));
    return {
        'test.run.start': async ({method, name}: {method: string; name?: string}, $meta: Meta) => {
            if (!serverGroups.has(method)) throw new Error(`Unknown server test group "${method}"`);
            const invoke = (
                proxy as unknown as Record<
                    string,
                    (params: object, meta: Meta) => Promise<StepArray>
                >
            )[methodName(method)];
            if (typeof invoke !== 'function') throw new Error(`No test group for "${method}"`);
            const steps = await invoke({}, $meta);
            if (!Array.isArray(steps)) throw new Error(`"${method}" did not return a step array`);
            // A test group signs in as its own users; the caller's gateway meta carries the
            // signed-in admin session and must not leak into the run.
            const runMeta: Meta = {};
            return (await controller()).start({
                method,
                name: name ?? method,
                steps,
                $meta: runMeta,
            });
        },
        'test.run.eventFind': async ({runId, cursor = -1}: {runId: string; cursor?: number}) =>
            (await controller()).events(runId, cursor),
        'test.run.snapshotGet': async ({runId}: {runId: string}) => {
            const run = (await controller()).snapshot(runId);
            if (!run) throw new Error(`Unknown test run "${runId}"`);
            return run;
        },
        'test.run.cancel': async ({runId}: {runId: string}) => {
            (await controller()).cancel(runId);
            return {success: true};
        },
    };
});
