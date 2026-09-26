/**
 * Build Allure labels from execution context
 */

import type {IAllureLabel, IAllureContext} from '../types.js';

/**
 * Construct Allure labels from execution context
 * 
 * @param context - Execution context with realm, collection, group info
 * @returns Array of Allure labels
 */
export function allureLabelsBuild(context: IAllureContext): IAllureLabel[] {
    const labels: IAllureLabel[] = [
        {name: 'framework', value: 'blong'},
        {name: 'language', value: 'typescript'},
        // A package can report to Allure from more than one producer — a browser suite and
        // its handler tests, say — and they land in one report, so each says which it is.
        {name: 'source', value: 'handler-test'},
    ];

    // parentSuite = realm name
    if (context.realm) {
        labels.push({name: 'parentSuite', value: context.realm});
    }

    // suite = collection name
    if (context.collection) {
        labels.push({name: 'suite', value: context.collection});
    }

    // subSuite = group name
    if (context.group) {
        labels.push({name: 'subSuite', value: context.group});
    }

    return labels;
}
