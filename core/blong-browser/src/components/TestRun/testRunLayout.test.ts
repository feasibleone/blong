import {describe, expect, it} from 'vitest';
import {denseRun, sessionFlowFailure, sessionFlowRun} from './fixtures/sessionFlow.js';
import {
    barPct,
    buildGraphLayout,
    buildTreeLayout,
    niceTicks,
    splitDependencies,
} from './testRunLayout.js';
import {deriveTestRun, groupKey} from './testRunModel.js';

describe('buildTreeLayout', () => {
    const run = sessionFlowRun();

    it('builds a root group with every step and the summed assertions', () => {
        const layout = buildTreeLayout(run);
        expect(layout.rows[0]).toMatchObject({
            kind: 'group',
            label: 'session flow',
            depth: 0,
            status: 'completed',
            assertions: {total: 39, threw: 0},
        });
        expect(layout.rows[0].childKeys).toHaveLength(11);
        expect(layout.rows.filter(row => row.kind === 'step')).toHaveLength(11);
        expect(layout.visibleSteps).toHaveLength(11);
        expect(layout.visibleSteps[0]).toBe('login');
        expect(layout.totalRows).toBe(11);
    });

    it('keeps every span relative to one shared axis', () => {
        const layout = buildTreeLayout(run);
        const verify = layout.rows.find(row => row.stepName === 'verifySession');
        expect(verify?.span).toBeDefined();
        expect(verify!.span!.start - layout.t0).toBe(0);
        expect(verify!.span!.queueEnd - layout.t0).toBe(413);
        expect(verify!.span!.end - layout.t0).toBe(509);
        expect(verify!.duration).toBe(96);
        expect(layout.t1 - layout.t0).toBe(812);
    });

    it('collapses a group and keeps its envelope bar', () => {
        const layout = buildTreeLayout(run, {collapsed: new Set([groupKey([])])});
        expect(layout.rows).toHaveLength(1);
        expect(layout.rows[0].collapsed).toBe(true);
        expect(layout.rows[0].hiddenCount).toBe(11);
        expect(layout.visibleSteps).toHaveLength(0);
        expect(layout.rows[0].span!.end - layout.rows[0].span!.start).toBe(812);
    });

    it('filters steps and reports what the group hides', () => {
        const layout = buildTreeLayout(run, {filter: step => step.stepName === 'login'});
        expect(layout.rows.map(row => row.key)).toEqual([groupKey([]), 'login']);
        expect(layout.rows[0].hiddenCount).toBe(10);
        expect(layout.visibleSteps).toEqual(['login']);
    });

    it('flattens the tree into start order on request', () => {
        const layout = buildTreeLayout(run, {order: 'start'});
        expect(layout.rows.every(row => row.kind === 'step')).toBe(true);
        expect(layout.rows[0].stepName).toBe('login');
        expect(layout.rows).toHaveLength(11);
    });

    it('survives the dense fixture', () => {
        const dense = denseRun();
        expect(dense.order).toHaveLength(40);
        expect(() => buildTreeLayout(dense)).not.toThrow();
        expect(buildTreeLayout(dense).visibleSteps).toHaveLength(40);
    });

    it('starts a parent bar at its earliest leaf start, not at the queue', () => {
        const dense = denseRun();
        const layout = buildTreeLayout(dense);
        const transfer = layout.rows.find(row => row.kind === 'group' && row.label === 'transfer');
        const leaves = dense.order
            .map(name => dense.steps[name])
            .filter(step => step.groupPath[0] === 'transfer');
        const firstStart = Math.min(...leaves.map(step => step.startedAt ?? 0));
        expect(transfer?.span).toBeDefined();
        expect(transfer!.span!.start).toBe(firstStart);
    });
});

describe('time scale', () => {
    it('produces ordered ticks inside the run', () => {
        const ticks = niceTicks(0, 812);
        expect(ticks.length).toBeGreaterThanOrEqual(4);
        expect(ticks[0].at).toBeGreaterThanOrEqual(0);
        expect(ticks[ticks.length - 1].at).toBeLessThanOrEqual(812);
        expect(ticks.map(tick => tick.at)).toEqual(
            [...ticks.map(tick => tick.at)].sort((a, b) => a - b),
        );
    });

    it('places a bar by percentage of the shared axis', () => {
        const pct = barPct({start: 0, queueEnd: 0, end: 412}, 0, 812);
        expect(pct.left).toBe(0);
        expect(pct.width).toBeCloseTo(50.74, 1);
        expect(pct.queueWidth).toBe(0);
    });

    it('splits queue time from execution time', () => {
        const pct = barPct({start: 100, queueEnd: 200, end: 400}, 0, 400);
        expect(pct.left).toBe(25);
        expect(pct.queueWidth).toBe(25);
        expect(pct.width).toBe(75);
    });
});

describe('buildGraphLayout', () => {
    const run = sessionFlowRun();

    it('puts every dependency one column before its dependent', () => {
        const graph = buildGraphLayout(run);
        expect(graph.nodes).toHaveLength(11);
        expect(graph.edges).toHaveLength(5);
        expect(graph.byName.login.level).toBe(0);
        expect(graph.byName.verifySession.level).toBe(1);
        expect(graph.byName.refreshToken.level).toBe(2);
        expect(graph.byName.reuseDetection.level).toBe(3);
        expect(graph.byName.revokedSession.level).toBe(4);
        expect(graph.byName.explicitClose.level).toBe(0);
        expect(graph.byName.cleanup.level).toBe(1);
        expect(graph.byName.login.x).toBeLessThan(graph.byName.verifySession.x);
    });

    it('keeps a node for every step of the failure and dense fixtures', () => {
        expect(buildGraphLayout(sessionFlowFailure()).nodes).toHaveLength(11);
        expect(buildGraphLayout(denseRun()).nodes).toHaveLength(40);
    });

    it('draws top to bottom when asked', () => {
        const vertical = buildGraphLayout(run, {orientation: 'vertical'});
        expect(vertical.byName.login.y).toBeLessThan(vertical.byName.verifySession.y);
        expect(vertical.byName.login.x).toBe(vertical.byName.verifySession.x);
    });

    it('chooses vertical automatically for a graph with fewer than five lanes', () => {
        const small = deriveTestRun({
            ...run,
            runId: 'small',
            name: 'small',
            order: ['login', 'verifySession', 'refreshToken'],
            steps: {
                login: run.steps.login,
                verifySession: run.steps.verifySession,
                refreshToken: run.steps.refreshToken,
            },
            edges: run.edges.filter(edge => ['verifySession', 'refreshToken'].includes(edge.from)),
            status: 'completed',
        });
        const graph = buildGraphLayout(small);
        expect(graph.byName.login.y).toBeLessThan(graph.byName.verifySession.y);
        expect(graph.byName.verifySession.y).toBeLessThan(graph.byName.refreshToken.y);
    });

    it('fills a measured graph box with larger nodes', () => {
        const small = deriveTestRun({
            ...run,
            runId: 'small',
            name: 'small',
            order: ['login', 'verifySession', 'refreshToken'],
            steps: {
                login: run.steps.login,
                verifySession: run.steps.verifySession,
                refreshToken: run.steps.refreshToken,
            },
            edges: run.edges.filter(edge => ['verifySession', 'refreshToken'].includes(edge.from)),
            status: 'completed',
        });
        const graph = buildGraphLayout(small, {targetWidth: 400, targetHeight: 600});
        expect(graph.width).toBe(400);
        expect(graph.height).toBe(600);
        expect(graph.byName.login.height).toBeGreaterThan(26);
        expect(graph.byName.login.x).toBeGreaterThan(0);
    });
});

describe('splitDependencies', () => {
    it('moves single steps and pairs out of the drawn graph', () => {
        const split = splitDependencies(sessionFlowRun());
        expect(split.graph.steps).toEqual([
            'login',
            'verifySession',
            'refreshToken',
            'reuseDetection',
            'revokedSession',
        ]);
        expect(split.graph.edges).toHaveLength(4);
        expect(split.loose.map(component => component.steps)).toEqual([
            ['explicitClose'],
            ['inactivity', 'cleanup'],
            ['auditLog'],
            ['loginActionRequired'],
            ['userInactiveRefusesRenewal'],
        ]);
    });

    it('lets the remaining chain use the measured height', () => {
        const run = sessionFlowRun();
        const split = splitDependencies(run);
        const graphRun = deriveTestRun({
            ...run,
            order: split.graph.steps,
            steps: Object.fromEntries(split.graph.steps.map(name => [name, run.steps[name]])),
            edges: split.graph.edges,
        });
        const graph = buildGraphLayout(graphRun, {targetWidth: 460, targetHeight: 600});
        expect(graph.byName.login.y).toBeLessThan(graph.byName.verifySession.y);
        expect(graph.byName.login.height).toBeGreaterThan(26);
    });
});
