/**
 * Map the progress a step announced to nested Allure steps (PRD R26/R27).
 *
 * The same tree the tap report draws, written as Allure's `steps`: a point is a step, and the
 * branch it was taken inside is the group of the points taken with it. A point has no outcome
 * of its own — it says what happened, not whether it was right — so it is reported as passed
 * and the verdict stays on the step that announced it.
 */

import {progressTree, type IProgressEntry, type IProgressNode} from '@feasibleone/blong-chain';
import type {IAllureStep} from '../types.js';

/**
 * Map a step's progress to Allure steps
 *
 * @param progress - The entries the step announced, in the order it announced them
 * @returns Nested Allure steps, or `undefined` when the step announced nothing
 */
export function allureProgressMap(
    progress: IProgressEntry[] | undefined,
): IAllureStep[] | undefined {
    const tree = progressTree(progress);
    if (tree.length === 0) {
        return undefined;
    }
    return tree.map(allureProgressStep);
}

/** One node of the progress tree as an Allure step, with its children nested under it. */
function allureProgressStep(node: IProgressNode): IAllureStep {
    return {
        name: node.name,
        status: 'passed',
        ...(node.children.length === 0 ? {} : {steps: node.children.map(allureProgressStep)}),
    };
}
