/**
 * useFeedbackConfig.ts — where the mode's wiring comes from (`@@T-467`).
 *
 * Two sources, in order: the portal config the browser was started with
 * (`config.portal.feedback`, which is where a suite writes it) and the config the
 * server composed for the menu (`portal.portalConfig.feedback`). A suite normally
 * writes the first; the second exists so a deployment can ship the block with the
 * rest of its portal configuration.
 *
 * Reading both matters: the composed config is a menu document and does not carry
 * everything a suite declares statically, so a switch that only looked at it would
 * never appear.
 */

import {useBlong, type IBlongPortalConfig} from '../context/BlongContext.js';
import {useAppStore} from '../state/appStore.js';
import type {IPortalFeedbackConfig} from '../types/portal.js';

export function useFeedbackConfig(): IPortalFeedbackConfig | undefined {
    const {config} = useBlong();
    const composed = useAppStore(state => state.portal.portalConfig?.feedback);
    const declared = (config as {portal?: IBlongPortalConfig}).portal?.feedback;
    return declared ?? composed;
}
