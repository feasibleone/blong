/**
 * Build Allure links (trace, issue, story)
 */

import type {IMeta} from '@feasibleone/blong-chain';
import type {IAllureContext, IAllureLink} from '../types.js';

/**
 * Construct Allure links with trace URL from $meta.traceId
 *
 * @param meta - Test execution metadata with traceId
 * @param context - Execution context with logUrl pattern
 * @returns Array of Allure links
 */
export function allureLinksBuild(meta: IMeta | undefined, context: IAllureContext): IAllureLink[] {
    const links: IAllureLink[] = [];

    // Add trace link if traceId exists
    if (meta?.traceId && context.logUrl) {
        const traceUrl = context.logUrl.replace('{traceId}', String(meta.traceId));
        links.push({
            type: 'trace',
            name: 'Trace',
            url: traceUrl,
        });
    }

    return links;
}
