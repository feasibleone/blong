/**
 * Map a group's steps to nested Allure steps.
 *
 * A group (a scenario) runs on one executor, whose steps arrive as a flat list
 * keyed by name — each carrying the `groupPath` that says where it sits in the
 * nesting the scenario wrote. This rebuilds that nesting for Allure: an inner
 * chain becomes a step inside its parent, and every step keeps the points it
 * announced as steps of its own (the same mapping `allureProgressMap` gives a
 * single result file, so a group result and a step result describe one shape).
 */

import type {IStepProgress} from '@feasibleone/blong-chain';
import type {IAllureStep} from '../types.js';
import {allureProgressMap} from './allureProgressMap.ts';
import {allureStatusMap} from './allureStatusMap.ts';

/** One node of the rebuilt tree: a step, and the steps nested inside it. */
interface IStepNode {
    step: IStepProgress;
    children: IStepNode[];
}

function nodeOf(step: IStepProgress): IStepNode {
    return {step, children: []};
}

/**
 * Rebuild the nesting whose paths are already on the steps.
 *
 * A step's path is the chain of names it ran inside, so the node a step belongs
 * under is the node whose path equals the step's path minus its own name. Steps
 * whose parent was not reported — a step that threw, or a group that never ran —
 * are kept at the top level rather than dropped, because a report that omits them
 * is worse than one that flattens them.
 */
function buildTree(steps: IStepProgress[]): IStepNode[] {
    const roots: IStepNode[] = [];
    const byPath = new Map<string, IStepNode>();
    for (const step of steps) {
        const path = step.groupPath ?? [];
        const parent = path.length > 0 ? byPath.get(path.join('\u0000')) : undefined;
        const node = nodeOf(step);
        if (parent) parent.children.push(node);
        else roots.push(node);
        byPath.set([...path, step.displayName ?? step.stepName].join('\u0000'), node);
    }
    return roots;
}

function stepOf(node: IStepNode): IAllureStep {
    const {step} = node;
    const allureStep: IAllureStep = {
        name: step.displayName ?? step.stepName,
        status: allureStatusMap(step.status),
        start: step.startTime,
        stop: step.endTime,
    };

    if (step.error) {
        allureStep.statusDetails = {message: step.error.message, trace: step.error.stack};
    }

    // What the step announced stays a step of its own, in the order it announced
    // it, and the steps it nested follow — a report reads the same top to bottom
    // as the scenario ran.
    const children = [
        ...(allureProgressMap(step.progress) ?? []),
        ...node.children.map(stepOf),
    ];
    if (children.length > 0) allureStep.steps = children;

    return allureStep;
}

/**
 * Map a group's step list to Allure steps
 *
 * @param steps - Every step the group's executor recorded
 * @returns Nested Allure steps, or `undefined` when the group ran none
 */
export function allureStepTreeMap(steps: IStepProgress[] | undefined): IAllureStep[] | undefined {
    if (!steps || steps.length === 0) return undefined;
    const mapped = buildTree(steps).map(stepOf);
    return mapped.length > 0 ? mapped : undefined;
}
